// Fila de sincronização de vendas (Fase 1, D1/T6; Linx L2). Tipos de job:
//   - 'sync-todas'        repetível (ERP_SYNC_CRON, padrão a cada 15 min): todas
//                         as integrações ATIVAS de todas as empresas;
//   - 'sync-integracao'   sob demanda (botão "Sincronizar agora" do Admin);
//   - 'reconciliar-todas' repetível (ERP_RECONCILIACAO_CRON, padrão 03:40):
//                         releitura idempotente de janela curta, sem mexer no cursor.
// concurrency 1: duas execuções nunca disputam o mesmo cursor (a ingestão é
// idempotente de qualquer forma).
import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { env } from '../config';
import { createLogger } from '../utils/logger';
import { reconciliarTodasAtivas, sincronizarIntegracao, sincronizarTodasAtivas } from '../fase1/integracoes/sync.service';

const log = createLogger('queue:sync-erp');

export const syncErpQueue = new Queue('sync-erp', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

export async function agendarSyncHorario() {
  await syncErpQueue.add('sync-todas', {}, { repeat: { pattern: env.ERP_SYNC_CRON }, jobId: 'sync-erp-repeatable-fase1' });
  log.info({ cron: env.ERP_SYNC_CRON }, 'sync de vendas agendado');
  await syncErpQueue.add('reconciliar-todas', {}, { repeat: { pattern: env.ERP_RECONCILIACAO_CRON }, jobId: 'reconciliacao-erp-repeatable' });
  log.info({ cron: env.ERP_RECONCILIACAO_CRON, dias: env.ERP_RECONCILIACAO_DIAS }, 'reconciliação de vendas agendada');
}

export async function solicitarSyncIntegracao(integracaoId: string) {
  // jobId por integração: dois cliques seguidos no botão viram UM job pendente.
  return syncErpQueue.add('sync-integracao', { integracaoId }, { jobId: `sync-manual-${integracaoId}`, removeOnComplete: true, removeOnFail: { age: 24 * 3600 } });
}

export async function contarFilaSync() {
  const c = await syncErpQueue.getJobCounts('waiting', 'delayed', 'failed', 'active');
  return { aguardando: (c.waiting ?? 0) + (c.delayed ?? 0), falhas: c.failed ?? 0 };
}

export function createSyncErpWorker() {
  return new Worker(
    'sync-erp',
    async (job) => {
      if (job.name === 'sync-integracao') {
        const resumo = await sincronizarIntegracao(String(job.data.integracaoId));
        log.info(resumo, 'sincronização manual concluída');
        return resumo;
      }
      if (job.name === 'reconciliar-todas') {
        const resumos = await reconciliarTodasAtivas();
        log.info({ integracoes: resumos.length, erros: resumos.filter((r) => r.status === 'ERRO').length }, 'reconciliação periódica concluída');
        return resumos;
      }
      const resumos = await sincronizarTodasAtivas();
      log.info({ integracoes: resumos.length, erros: resumos.filter((r) => r.status === 'ERRO').length }, 'sincronização periódica concluída');
      return resumos;
    },
    { connection, concurrency: 1 }
  );
}
