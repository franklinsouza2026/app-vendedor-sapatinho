// League (Fatia 8, seção 18-20) — agrupamento competitivo administrável;
// promoção/rebaixamento é foundation simples e 100% determinística (seção
// 20: "não implementar sistema exageradamente complexo").
//
// Multiempresa (Fase 1, D8): cada empresa tem as próprias ligas (`code` único
// POR empresa). Participante só circula entre ligas da empresa da season.
import { TipoParticipante } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { totalPontosSeason } from './seasons.service';
import { publicarEventoFeed } from './feed.service';
import { CompeticoesError, LIGAS_SEED_V1 } from './constantes';

export async function seedLigasV1(empresaId: string) {
  for (const liga of LIGAS_SEED_V1) {
    await prisma.league.upsert({ where: { empresaId_code: { empresaId, code: liga.code } }, update: {}, create: { ...liga, empresaId } });
  }
}

export async function listarLigas(empresaId: string) {
  return prisma.league.findMany({ where: { empresaId }, orderBy: { sortOrder: 'asc' } });
}

export async function criarLiga(empresaId: string, dados: { code: string; name: string; sortOrder: number; promotionThreshold?: number; relegationThreshold?: number }, actorId: string) {
  const liga = await prisma.league.create({ data: { ...dados, empresaId } });
  await registrarEventoAuditoria({ empresaId, acao: 'LEAGUE_CREATED', actorId, metadata: { leagueId: liga.id } });
  return liga;
}

export async function atualizarLiga(empresaId: string, id: string, dados: Partial<{ name: string; sortOrder: number; promotionThreshold: number; relegationThreshold: number; active: boolean }>, actorId: string) {
  const resultado = await prisma.league.updateMany({ where: { id, empresaId }, data: dados });
  if (resultado.count !== 1) throw new CompeticoesError('not_found', 'liga não encontrada');
  await registrarEventoAuditoria({ empresaId, acao: 'LEAGUE_UPDATED', actorId, metadata: { leagueId: id } });
  return prisma.league.findUniqueOrThrow({ where: { id } });
}

/** Liga atual do participante (`exitedAt: null`) — se nunca teve nenhuma,
 * devolve a de menor `sortOrder` da empresa (entrada padrão), sem persistir
 * nada até `garantirMembroNaLiga` ser chamado de verdade. */
export async function ligaAtualDoParticipante(empresaId: string, participantType: TipoParticipante, participantId: string) {
  const membership = await prisma.leagueMembership.findFirst({ where: { participantType, participantId, exitedAt: null, liga: { empresaId } }, include: { liga: true } });
  if (membership) return membership.liga;
  return prisma.league.findFirst({ where: { empresaId, active: true }, orderBy: { sortOrder: 'asc' } });
}

export async function garantirMembroNaLiga(seasonId: string, participantType: TipoParticipante, participantId: string) {
  const season = await prisma.season.findUniqueOrThrow({ where: { id: seasonId }, select: { empresaId: true } });
  const existente = await prisma.leagueMembership.findFirst({ where: { participantType, participantId, exitedAt: null, liga: { empresaId: season.empresaId } } });
  if (existente) return existente;
  const primeiraLiga = await prisma.league.findFirst({ where: { empresaId: season.empresaId, active: true }, orderBy: { sortOrder: 'asc' } });
  if (!primeiraLiga) throw new CompeticoesError('not_found', 'nenhuma liga ativa cadastrada — rode o seed');
  return prisma.leagueMembership.create({ data: { seasonId, leagueId: primeiraLiga.id, participantType, participantId, reason: 'ENTRADA_INICIAL' } });
}

/**
 * Promoção/rebaixamento na finalização da Season (seção 20/66) — dentro de
 * CADA liga da empresa da season, ranqueia os membros por Season Points; top N
 * (promotionThreshold) sobe pra próxima liga (maior sortOrder), bottom N
 * (relegationThreshold) desce — nunca edita a membership antiga, sempre fecha
 * e abre uma nova (histórico preservado, seção 19).
 */
export async function processarPromocaoRebaixamento(seasonId: string) {
  const season = await prisma.season.findUniqueOrThrow({ where: { id: seasonId }, select: { empresaId: true } });
  const ligas = await prisma.league.findMany({ where: { empresaId: season.empresaId, active: true }, orderBy: { sortOrder: 'asc' } });

  for (let i = 0; i < ligas.length; i++) {
    const liga = ligas[i];
    const membros = await prisma.leagueMembership.findMany({ where: { leagueId: liga.id, exitedAt: null } });
    if (membros.length === 0) continue;

    const comPontos = await Promise.all(membros.map(async (m) => ({ membership: m, pontos: await totalPontosSeason(seasonId, m.participantType, m.participantId) })));
    comPontos.sort((a, b) => b.pontos - a.pontos);

    const ligaAcima = ligas[i + 1];
    const ligaAbaixo = ligas[i - 1];

    for (let pos = 0; pos < comPontos.length; pos++) {
      const { membership } = comPontos[pos];
      const promovido = ligaAcima && liga.promotionThreshold !== null && pos < (liga.promotionThreshold ?? 0);
      const rebaixado = !promovido && ligaAbaixo && liga.relegationThreshold !== null && pos >= comPontos.length - (liga.relegationThreshold ?? 0);
      if (!promovido && !rebaixado) continue;

      const novaLiga = promovido ? ligaAcima : ligaAbaixo;
      await prisma.leagueMembership.update({ where: { id: membership.id }, data: { exitedAt: new Date(), reason: promovido ? 'PROMOVIDO' : 'REBAIXADO' } });
      await prisma.leagueMembership.create({
        data: { seasonId, leagueId: novaLiga!.id, participantType: membership.participantType, participantId: membership.participantId, reason: promovido ? 'PROMOVIDO' : 'REBAIXADO' },
      });
      await registrarEventoAuditoria({
        empresaId: season.empresaId,
        acao: promovido ? 'LEAGUE_PROMOTED' : 'LEAGUE_RELEGATED',
        metadata: { seasonId, participantId: membership.participantId, deLigaId: liga.id, paraLigaId: novaLiga!.id },
      });
      if (promovido && membership.participantType === 'SELLER') {
        const vendedor = await prisma.vendedor.findUnique({ where: { id: membership.participantId }, select: { lojaId: true } });
        await publicarEventoFeed({ empresaId: season.empresaId, eventType: 'LEAGUE_PROMOTED', sourceType: 'LEAGUE_MEMBERSHIP', sourceId: membership.id, visibility: 'STORE', lojaId: vendedor?.lojaId, subjectId: membership.participantId, templateData: { leagueName: novaLiga!.name } });
      }
    }
  }
}
