// Feed Social controlado (Fatia 8, seção 33-42) — 100% system-generated,
// nunca LLM (seção 35): mensagem é sempre reconstruída a partir de
// `eventType` + `templateData` estruturado, nunca uma string livre gravada
// no banco. Idempotente por (eventType, sourceType, sourceId) — nunca
// publica o mesmo evento 2x (seção 40, anti-spam).
import { Prisma, VisibilidadeFeed } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from '../universidade/schools.service';

export interface PublicarEventoFeedInput {
  eventType: string;
  sourceType: string;
  sourceId: string;
  visibility: VisibilidadeFeed;
  lojaId?: string;
  actorId?: string;
  subjectId?: string;
  templateData: Record<string, unknown>;
}

/** Templates fixos (seção 35) — o front-end nunca recebe HTML, só dados
 * estruturados; a montagem da frase final é sempre determinística. */
export const TEMPLATES_FEED: Record<string, (d: Record<string, unknown>) => string> = {
  GOAL_REACHED: () => 'bateu a meta do dia! 🎯',
  BADGE_EARNED: (d) => `conquistou o badge "${d.badgeTitulo}"! 🏅`,
  CERTIFICATION_ISSUED: (d) => `conquistou a certificação "${d.certificationName}"! 🎓`,
  MISSION_COMPLETED: (d) => `completou a missão "${d.missionTitle}"!`,
  COMPETITION_WON: (d) => `venceu a competição "${d.competitionName}"! 🏆`,
  LEAGUE_PROMOTED: (d) => `subiu para a Liga ${d.leagueName}! ⬆️`,
  RECOGNITION_RECEIVED: (d) => `recebeu um reconhecimento: "${d.recognitionTipo}" 👏`,
  PDI_COMPLETED: (d) => `concluiu o plano de desenvolvimento de "${d.competencyName}"!`,
  TRACK_COMPLETED: (d) => `concluiu a trilha "${d.trackTitle}"!`,
};

/**
 * Publica um evento no Feed de forma idempotente (create + catch P2002 —
 * mesmo padrão desde a Fatia 4). Nunca lança erro se o evento já existe
 * (evento duplicado é esperado quando vários hooks tentam publicar o mesmo
 * fato — o primeiro vence, os demais são no-op silencioso).
 */
export async function publicarEventoFeed(input: PublicarEventoFeedInput) {
  try {
    const evento = await prisma.feedEvent.create({
      data: {
        eventType: input.eventType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        visibility: input.visibility,
        lojaId: input.lojaId,
        actorId: input.actorId,
        subjectId: input.subjectId,
        templateData: input.templateData as Prisma.InputJsonValue,
      },
    });
    await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'FEED_EVENT_CREATED', metadata: { feedEventId: evento.id, eventType: input.eventType } });
    return evento;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.feedEvent.findUniqueOrThrow({ where: { eventType_sourceType_sourceId: { eventType: input.eventType, sourceType: input.sourceType, sourceId: input.sourceId } } });
    }
    throw err;
  }
}

/**
 * Listagem paginada (cursor, seção 117) filtrada por visibilidade real do
 * viewer (seção 36/105): COMPANY sempre visível; STORE só se `lojaId`
 * bater com a loja do viewer; PRIVATE nunca aparece no feed geral (é
 * reservado pra notificação direta, fora do escopo desta fatia).
 */
export async function listarFeed(viewerLojaId: string, opcoes: { limite: number; cursor?: string }) {
  const eventos = await prisma.feedEvent.findMany({
    where: { OR: [{ visibility: 'COMPANY' }, { visibility: 'STORE', lojaId: viewerLojaId }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opcoes.limite,
    ...(opcoes.cursor ? { skip: 1, cursor: { id: opcoes.cursor } } : {}),
  });

  const idsVendedores = [...new Set(eventos.flatMap((e) => [e.actorId, e.subjectId]).filter((v): v is string => !!v))];
  const vendedores = await prisma.vendedor.findMany({ where: { id: { in: idsVendedores } }, select: { id: true, nome: true } });
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

  return {
    eventos: eventos.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      visibility: e.visibility,
      createdAt: e.createdAt,
      subjectNome: e.subjectId ? (nomePorId.get(e.subjectId) ?? '—') : null,
      mensagem: (TEMPLATES_FEED[e.eventType] ?? (() => e.eventType))(e.templateData as Record<string, unknown>),
    })),
    proximoCursor: eventos.length === opcoes.limite ? eventos[eventos.length - 1].id : null,
  };
}
