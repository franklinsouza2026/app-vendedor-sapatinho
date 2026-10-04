import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import { logger } from './utils/logger';
import { createSyncErpWorker, agendarSyncHorario } from './queues/sync-erp.queue';
import { createFechamentoDiaWorker, agendarFechamentoDiario } from './queues/fechamento-dia.queue';
import { createTrainingIntelligenceWorker } from './queues/training-intelligence.queue';
import { createTemporadasWorker, agendarProcessamentoTemporadas } from './queues/temporadas.queue';
import { prisma } from './db';

/** Batida do worker (T6): a API mostra no Admin se o processador de tarefas está vivo. */
async function baterCoracao() {
  try {
    await prisma.workerHeartbeat.upsert({ where: { nome: 'worker' }, create: { nome: 'worker', ultimoEm: new Date(), info: { pid: process.pid } }, update: { ultimoEm: new Date(), info: { pid: process.pid } } });
  } catch (err) {
    logger.error({ err }, 'falha ao registrar batida do worker');
  }
}

async function main() {
  await baterCoracao();
  setInterval(baterCoracao, 60_000).unref();

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

  const temporadasWorker = createTemporadasWorker();
  temporadasWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'job de temporadas/competições concluído'));
  temporadasWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de temporadas/competições falhou'));
  await agendarProcessamentoTemporadas();

  logger.info({ syncCron: env.ERP_SYNC_CRON }, 'worker rodando — sync de vendas, fechamento diário, Training Intelligence e temporadas/competições agendados');
}

main().catch((err) => {
  logger.fatal({ err }, 'worker falhou ao iniciar');
  process.exit(1);
});
