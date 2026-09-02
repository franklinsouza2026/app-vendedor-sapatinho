// Season (Fatia 8, seção 4-8) — período oficial de competição. NUNCA reseta
// XP/VendaCoins/badges/certificações/PDI/performance histórica (seção 5) —
// Season Points são um conceito totalmente separado, só existem dentro do
// escopo de uma Season, nunca gastam XP nem mexem na wallet real.
import { Prisma, StatusSeason, TipoParticipante } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from '../universidade/schools.service';
import { CompeticoesError } from './constantes';

export async function criarSeason(
  dados: { code: string; name: string; description: string; startsAt: Date; endsAt: Date; registrationStartsAt?: Date; registrationEndsAt?: Date },
  actorId: string
) {
  if (dados.endsAt <= dados.startsAt) throw new CompeticoesError('invalid_reference', 'endsAt precisa ser depois de startsAt');
  const season = await prisma.season.create({ data: { ...dados, createdBy: actorId } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'SEASON_CREATED', actorId, metadata: { seasonId: season.id } });
  return season;
}

export async function listarSeasons() {
  return prisma.season.findMany({ orderBy: { startsAt: 'desc' } });
}

export async function buscarSeason(id: string) {
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) throw new CompeticoesError('not_found', 'season não encontrada');
  return season;
}

const TRANSICOES_SEASON: Record<'agendar' | 'ativar' | 'cancelar', { de: StatusSeason[]; para: StatusSeason; acao: 'SEASON_SCHEDULED' | 'SEASON_STARTED' | 'SEASON_CANCELLED' }> = {
  agendar: { de: ['DRAFT'], para: 'SCHEDULED', acao: 'SEASON_SCHEDULED' },
  ativar: { de: ['SCHEDULED', 'DRAFT'], para: 'ACTIVE', acao: 'SEASON_STARTED' },
  cancelar: { de: ['DRAFT', 'SCHEDULED', 'ACTIVE'], para: 'CANCELLED', acao: 'SEASON_CANCELLED' },
};

// actorId opcional (seção 67): ativação/finalização automática pelo worker
// não tem um Vendedor humano por trás — AuditEvent.actorId é uma FK real
// pra Vendedor (achado da Fatia 7.5D), nunca um id fictício tipo
// "sistema"/"worker" seria aceito ali.
export async function transicionarSeason(id: string, transicao: keyof typeof TRANSICOES_SEASON, actorId?: string) {
  const regra = TRANSICOES_SEASON[transicao];
  const atual = await buscarSeason(id);
  const resultado = await prisma.season.updateMany({ where: { id, status: { in: regra.de } }, data: { status: regra.para } });
  if (resultado.count !== 1) throw new CompeticoesError('invalid_transition', `season não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: regra.acao, actorId, metadata: { seasonId: id } });
  return buscarSeason(id);
}

/**
 * Concede Season Points de forma idempotente (seção 7) — mesmo
 * (season, participante, sourceType, sourceId) nunca gera 2 entradas.
 * `points` pode ser negativo (compensação de cancelamento/devolução,
 * seção 28) — o ledger é append-only, nunca edita uma entrada existente.
 */
export async function registrarPontosSeason(params: {
  seasonId: string;
  participantType: TipoParticipante;
  participantId: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  points: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    return await prisma.seasonPointLedger.create({
      data: {
        seasonId: params.seasonId,
        participantType: params.participantType,
        participantId: params.participantId,
        eventType: params.eventType,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        points: params.points,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.seasonPointLedger.findUniqueOrThrow({
        where: { seasonId_participantType_participantId_sourceType_sourceId: { seasonId: params.seasonId, participantType: params.participantType, participantId: params.participantId, sourceType: params.sourceType, sourceId: params.sourceId } },
      });
    }
    throw err;
  }
}

export async function totalPontosSeason(seasonId: string, participantType: TipoParticipante, participantId: string): Promise<number> {
  const resultado = await prisma.seasonPointLedger.aggregate({ where: { seasonId, participantType, participantId }, _sum: { points: true } });
  return resultado._sum.points ?? 0;
}

/** Ranking de Season Points — nunca expõe dado sensível (só o conceito de
 * pontos dentro da season, sem relação direta com faturamento bruto). */
export async function rankingSeason(seasonId: string, participantType: TipoParticipante) {
  const totais = await prisma.seasonPointLedger.groupBy({
    by: ['participantId'],
    where: { seasonId, participantType },
    _sum: { points: true },
  });
  return totais
    .map((t) => ({ participantId: t.participantId, points: t._sum.points ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .map((t, idx) => ({ ...t, posicao: idx + 1 }));
}
