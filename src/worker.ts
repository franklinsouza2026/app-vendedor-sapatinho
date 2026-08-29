import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import { logger } from './utils/logger';
import { createSyncErpWorker, agendarSyncHorario } from './queues/sync-erp.queue';

async function main() {
  const worker = createSyncErpWorker();

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job de sync concluído'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de sync falhou'));

  await agendarSyncHorario();

  logger.info({ erpMode: env.ERP_MODE }, 'worker rodando — sync horário agendado');
}

main().catch((err) => {
  logger.fatal({ err }, 'worker falhou ao iniciar');
  process.exit(1);
});
