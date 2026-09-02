// Orquestração de fechamento de Season (Fatia 8, seção 66) — arquivo
// separado (não dentro de seasons.service.ts) só pra evitar import
// circular: esta função depende de seasons + competitions + leagues, mas
// nenhum dos 3 depende dela de volta.
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from '../universidade/schools.service';
import { buscarSeason } from './seasons.service';
import { finalizarCompetition } from './competitions.service';
import { processarPromocaoRebaixamento } from './leagues.service';

/**
 * Finaliza TODAS as competições ativas da season, processa promoção/
 * rebaixamento de liga, e só então marca a Season como FINISHED. Transição
 * atômica (`updateMany` condicional) — 2 chamadas concorrentes (worker +
 * Admin manual, por exemplo) resultam em exatamente 1 execução efetiva
 * (seção 68/84/104): a 2ª chamada encontra a season já FINISHED e devolve
 * sem reprocessar nada.
 */
export async function finalizarSeasonCompleta(seasonId: string, actorId?: string) {
  const atual = await buscarSeason(seasonId);
  if (atual.status === 'FINISHED') return atual; // idempotente — já processada

  const competicoesAtivas = await prisma.competition.findMany({ where: { seasonId, status: 'ACTIVE' }, select: { id: true } });
  for (const c of competicoesAtivas) {
    await finalizarCompetition(c.id, actorId);
  }

  const resultado = await prisma.season.updateMany({ where: { id: seasonId, status: { not: 'FINISHED' } }, data: { status: 'FINISHED' } });
  if (resultado.count !== 1) return buscarSeason(seasonId); // corrida perdida — outra chamada já finalizou

  await processarPromocaoRebaixamento(seasonId);
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'SEASON_FINISHED', actorId, metadata: { seasonId, competicoesFinalizadas: competicoesAtivas.length } });
  return buscarSeason(seasonId);
}
