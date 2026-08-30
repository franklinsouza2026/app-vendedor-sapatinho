// Execução assíncrona da Training Intelligence Platform (Fatia 7.5D, seção
// 6): a rota HTTP só cria o job (QUEUED) e enfileira — nunca processa
// pesquisa/curadoria/design instrucional dentro do request síncrono. O
// worker chama `executarJob` diretamente (mesma função testada em
// integração, sem depender do BullMQ estar de pé pra testar a lógica).
import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { createLogger } from '../utils/logger';
import { executarJob } from '../training-intelligence/orchestrator.service';

const log = createLogger('queue:training-intelligence');

export const trainingIntelligenceQueue = new Queue('training-intelligence', {
  connection,
  defaultJobOptions: {
    attempts: 1, // retry de etapa já é tratado dentro de executarJob — retry no nível do BullMQ duplicaria efeito
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

/** jobId do BullMQ = id do TrainingIntelligenceJob — double-enqueue acidental
 * (ex. reiniciar o processo que criou o job) nunca duplica a execução. */
export async function enfileirarJobTreinamento(jobId: string) {
  await trainingIntelligenceQueue.add('executar', { jobId }, { jobId });
}

export function createTrainingIntelligenceWorker() {
  return new Worker(
    'training-intelligence',
    async (job) => {
      await executarJob(job.data.jobId as string);
    },
    { connection, concurrency: 2 }
  );
}
