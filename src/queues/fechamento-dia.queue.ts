// Job diário (repetível) que fecha o streak do dia anterior pra todos os
// vendedores ativos. Streak só avalia dias fechados (ver streak.service.ts) —
// esse job é quem materializa esse fechamento uma vez por dia.
import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { createLogger } from '../utils/logger';
import { prisma } from '../db';
import { avaliarFechamentoDia } from '../gamificacao/streak.service';
import { dataISO } from '../services/metas.service';

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
      repeat: { pattern: '10 0 * * *' }, // 00:10 todo dia — dá margem pro último sync horário do dia anterior consolidar
      jobId: 'fechamento-dia-repeatable',
    }
  );
  log.info('fechamento diário de streak agendado (00:10)');
}

export function createFechamentoDiaWorker() {
  return new Worker(
    'fechamento-dia',
    async () => {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      const vendedores = await prisma.vendedor.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

      let fechados = 0;
      let falhas = 0;
      for (const v of vendedores) {
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

      log.info({ vendedores: vendedores.length, fechados, falhas, dia: dataISO(ontem) }, 'fechamento de dia concluído');
    },
    { connection, concurrency: 1 }
  );
}
