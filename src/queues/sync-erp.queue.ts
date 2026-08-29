import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { createLogger } from '../utils/logger';
import { erpAdapter } from '../integracoes/erp';
import { prisma } from '../db';

const log = createLogger('queue:sync-erp');

export const syncErpQueue = new Queue('sync-erp', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

/**
 * Agenda o job repetível de hora em hora. Chamar uma vez no boot do worker.
 * jobId fixo garante que o schedule não duplica se o worker reiniciar.
 */
export async function agendarSyncHorario() {
  await syncErpQueue.add(
    'sync-todas-lojas',
    {},
    {
      repeat: { pattern: '0 * * * *' },
      jobId: 'sync-erp-repeatable',
    }
  );
  log.info('sync horário de indicadores agendado');
}

export function createSyncErpWorker() {
  return new Worker(
    'sync-erp',
    async (job) => {
      const dataHora = new Date();
      dataHora.setMinutes(0, 0, 0); // normaliza pro início da hora — chave de idempotência

      const lojas = await prisma.loja.findMany({ select: { id: true, empresaId: true, codigoErp: true } });

      let totalProcessados = 0;

      for (const loja of lojas) {
        const indicadores = await erpAdapter.buscarIndicadoresPorLoja(loja.codigoErp, dataHora);

        for (const ind of indicadores) {
          const vendedor = await prisma.vendedor.findUnique({
            where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: ind.matriculaErp } },
          });

          if (!vendedor) {
            log.warn({ loja: loja.codigoErp, matricula: ind.matriculaErp }, 'vendedor do ERP não cadastrado no app — pulando');
            continue;
          }

          await prisma.indicadorRealizado.upsert({
            where: { vendedorId_dataHora: { vendedorId: vendedor.id, dataHora } },
            create: {
              empresaId: loja.empresaId,
              lojaId: loja.id,
              vendedorId: vendedor.id,
              dataHora,
              faturamento: ind.faturamento,
              ticketMedio: ind.ticketMedio,
              pa: ind.pa,
              numAtendimentos: ind.numAtendimentos,
              fonteJobId: job.id!,
            },
            update: {
              faturamento: ind.faturamento,
              ticketMedio: ind.ticketMedio,
              pa: ind.pa,
              numAtendimentos: ind.numAtendimentos,
              fonteJobId: job.id!,
            },
          });

          totalProcessados++;
        }
      }

      log.info({ lojas: lojas.length, vendedoresProcessados: totalProcessados, dataHora }, 'sync de indicadores concluído');
    },
    { connection, concurrency: 1 } // 1 por vez — evita corrida entre execuções do mesmo horário
  );
}
