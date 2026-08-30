import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import { logger } from './utils/logger';
import { createSyncErpWorker, agendarSyncHorario } from './queues/sync-erp.queue';
import { createFechamentoDiaWorker, agendarFechamentoDiario } from './queues/fechamento-dia.queue';
import { createTrainingIntelligenceWorker } from './queues/training-intelligence.queue';

async function main() {
  const syncWorker = createSyncErpWorker();
  syncWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'job de sync concluído'));
  syncWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de sync falhou'));
  await agendarSyncHorario();

  const fechamentoWorker = createFechamentoDiaWorker();
  fechamentoWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'job de fechamento de dia concluído'));
  fechamentoWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de fechamento de dia falhou'));
  await agendarFechamentoDiario();

  const trainingIntelligenceWorker = createTrainingIntelligenceWorker();
  trainingIntelligenceWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'job de Training Intelligence concluído'));
  trainingIntelligenceWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de Training Intelligence falhou'));

  logger.info({ erpMode: env.ERP_MODE }, 'worker rodando — sync horário, fechamento diário e Training Intelligence agendados');
}

main().catch((err) => {
  logger.fatal({ err }, 'worker falhou ao iniciar');
  process.exit(1);
});
