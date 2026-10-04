// Job diário (repetível) que fecha o streak do dia anterior pra todos os
// vendedores ativos. Streak só avalia dias fechados (ver streak.service.ts) —
// esse job é quem materializa esse fechamento uma vez por dia.
import { Queue, Worker } from 'bullmq';
import { diaLocal, instanteDoDia, somarDias } from '../tempo/dia';
import { connection } from './connection';
import { createLogger } from '../utils/logger';
import { prisma } from '../db';
import { avaliarFechamentoDia } from '../gamificacao/streak.service';

const log = createLogger('queue:fechamento-dia');

export const fechamentoDiaQueue = new Queue('fechamento-dia', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 30 * 24 * 3600 },
    removeOnFail: { age: 90 * 24 * 3600 },
  },
});

export async function agendarFechamentoDiario() {
  await fechamentoDiaQueue.add(
    'fechar-dia-anterior',
    {},
    {
      // Fase 1: roda de hora em hora (minuto 10) e fecha o "ontem" LOCAL de
      // cada empresa (Empresa.timezone). Antes era 00:10 do fuso do processo —
      // num container UTC, 21h10 de Brasília, fechando o dia com a loja aberta.
      // Fechar é idempotente (StreakChecagem @@unique), então rodar a cada hora
      // só garante que o dia fecha até ~1h depois da meia-noite local.
      repeat: { pattern: '10 * * * *' },
      jobId: 'fechamento-dia-repeatable-v2',
    }
  );
  log.info('fechamento diário de streak agendado (hora em hora, ontem local por empresa)');
}

export function createFechamentoDiaWorker() {
  return new Worker(
    'fechamento-dia',
    async () => {
      const empresas = await prisma.empresa.findMany({ select: { id: true, timezone: true } });
      const ontemPorEmpresa = new Map(empresas.map((e) => [e.id, instanteDoDia(somarDias(diaLocal(new Date(), e.timezone), -1), e.timezone)]));

      const vendedores = await prisma.vendedor.findMany({ where: { status: 'ACTIVE' }, select: { id: true, empresaId: true } });

      let fechados = 0;
      let falhas = 0;
      for (const v of vendedores) {
        const ontem = ontemPorEmpresa.get(v.empresaId);
        if (!ontem) continue;
        try {
          const resultado = await avaliarFechamentoDia(v.id, ontem);
          if (resultado.avaliado) fechados++;
        } catch (err) {
          // Isola falha por vendedor — mesmo padrão do sync-erp.queue.ts.
          // Sem isso, 1 vendedor com erro aborta o fechamento de todos os outros.
          falhas++;
          log.error({ err, vendedorId: v.id }, 'falha ao fechar dia deste vendedor — outros vendedores não são afetados');
        }
      }

      log.info({ vendedores: vendedores.length, fechados, falhas }, 'fechamento de dia concluído');
    },
    { connection, concurrency: 1 }
  );
}
