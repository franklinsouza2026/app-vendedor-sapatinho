// Job repetível que ativa Seasons/Competitions agendadas cujo horário
// chegou, e finaliza as que já passaram do prazo (Fatia 8, seção 67/68) —
// mesmo padrão de fechamento-dia.queue.ts. Rodar duas vezes seguidas nunca
// duplica efeito: ativar/finalizar já são transições atômicas condicionais
// (`updateMany` com `where: status`), a 2ª chamada sempre encontra 0 linhas
// pra mudar.
import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { createLogger } from '../utils/logger';
import { prisma } from '../db';
import { transicionarSeason } from '../competicoes/seasons.service';
import { transicionarCompetition } from '../competicoes/competitions.service';
import { finalizarSeasonCompleta } from '../competicoes/season-finalization.service';
import { finalizarCompetition } from '../competicoes/competitions.service';

const log = createLogger('queue:temporadas');

export const temporadasQueue = new Queue('temporadas', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 30 * 24 * 3600 },
    removeOnFail: { age: 90 * 24 * 3600 },
  },
});

export async function agendarProcessamentoTemporadas() {
  await temporadasQueue.add('processar-temporadas', {}, { repeat: { pattern: '*/15 * * * *' }, jobId: 'temporadas-repeatable' });
  log.info('processamento de seasons/competitions agendado (a cada 15 minutos)');
}

export function createTemporadasWorker() {
  return new Worker(
    'temporadas',
    async () => {
      const agora = new Date();
      let ativadas = 0;
      let finalizadas = 0;

      const seasonsParaAtivar = await prisma.season.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: agora } }, select: { id: true } });
      for (const s of seasonsParaAtivar) {
        try {
          await transicionarSeason(s.id, 'ativar');
          ativadas++;
        } catch (err) {
          log.error({ err, seasonId: s.id }, 'falha ao ativar season — outras seasons não são afetadas');
        }
      }

      const seasonsParaFinalizar = await prisma.season.findMany({ where: { status: 'ACTIVE', endsAt: { lte: agora } }, select: { id: true } });
      for (const s of seasonsParaFinalizar) {
        try {
          await finalizarSeasonCompleta(s.id);
          finalizadas++;
        } catch (err) {
          log.error({ err, seasonId: s.id }, 'falha ao finalizar season — outras seasons não são afetadas');
        }
      }

      const competitionsParaAtivar = await prisma.competition.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: agora } }, select: { id: true } });
      for (const c of competitionsParaAtivar) {
        try {
          await transicionarCompetition(c.id, 'ativar');
          ativadas++;
        } catch (err) {
          log.error({ err, competitionId: c.id }, 'falha ao ativar competição — outras competições não são afetadas');
        }
      }

      // Só finaliza aqui competições SEM season (season finaliza as suas
      // próprias competições dentro de finalizarSeasonCompleta).
      const competitionsParaFinalizar = await prisma.competition.findMany({ where: { status: 'ACTIVE', endsAt: { lte: agora }, seasonId: null }, select: { id: true } });
      for (const c of competitionsParaFinalizar) {
        try {
          await finalizarCompetition(c.id);
          finalizadas++;
        } catch (err) {
          log.error({ err, competitionId: c.id }, 'falha ao finalizar competição — outras competições não são afetadas');
        }
      }

      log.info({ ativadas, finalizadas }, 'processamento de temporadas/competições concluído');
    },
    { connection, concurrency: 1 }
  );
}
