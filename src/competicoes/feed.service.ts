// Feed Social controlado (Fatia 8, seção 33-42) — 100% system-generated,
// nunca LLM (seção 35): mensagem é sempre reconstruída a partir de
// `eventType` + `templateData` estruturado, nunca uma string livre gravada
// no banco. Idempotente por (eventType, sourceType, sourceId) — nunca
// publica o mesmo evento 2x (seção 40, anti-spam).
//
// Multiempresa (Fase 1, D8): todo evento pertence a UMA empresa e a leitura
// filtra por ela — visibilidade COMPANY nunca atravessa empresas. Evento cujo
// fato foi desfeito por correção de venda (D4) é REVOGADO (some da lista),
// nunca apagado.
import { Prisma, VisibilidadeFeed } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';

export interface PublicarEventoFeedInput {
  /** Empresa do evento. Se omitida, é resolvida pela loja ou pelo vendedor (sujeito/ator) — nunca adivinhada. */
  empresaId?: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  visibility: VisibilidadeFeed;
  lojaId?: string;
  actorId?: string;
  subjectId?: string;
  templateData: Record<string, unknown>;
  /** Momento do fato (ex.: dia da venda). Padrão: agora. */
  ocorridoEm?: Date;
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
  RECOGNITION_RECEIVED: (d) => (d.titulo ? `recebeu um reconhecimento: "${d.titulo}" 👏` : `recebeu um reconhecimento: "${d.recognitionTipo}" 👏`),
  PDI_COMPLETED: (d) => `concluiu o plano de desenvolvimento de "${d.competencyName}"!`,
  TRACK_COMPLETED: (d) => `concluiu a trilha "${d.trackTitle}"!`,
  // Fase 1 — Performance & Game.
  RECORD_BROKEN: (d) => `quebrou o recorde pessoal: ${d.recordeTitulo}! 🚀`,
  RANK_UP: (d) => `subiu para o ${d.posicao}º lugar no ranking ${d.escopo === 'LOJA' ? 'da loja' : 'geral'} do mês. ⬆️`,
  STORE_LEAD: (d) => `${d.lojaNome} assumiu a liderança do Loja × Loja. 🏬`,
  COMPETITION_STARTED: (d) => `Começou a competição "${d.competitionName}". 🏁`,
  CAMPAIGN_FINISHED: (d) => `A campanha "${d.campanhaNome}" foi encerrada. Confira o resultado. 🏆`,
};

async function resolverEmpresa(input: PublicarEventoFeedInput): Promise<string> {
  if (input.empresaId) return input.empresaId;
  if (input.lojaId) {
    const loja = await prisma.loja.findUnique({ where: { id: input.lojaId }, select: { empresaId: true } });
    if (loja) return loja.empresaId;
  }
  for (const id of [input.subjectId, input.actorId]) {
    if (!id) continue;
    const vendedor = await prisma.vendedor.findUnique({ where: { id }, select: { empresaId: true } });
    if (vendedor) return vendedor.empresaId;
  }
  throw new Error(`evento de feed ${input.eventType} sem empresa resolvível (sem empresaId, loja ou vendedor)`);
}

/**
 * Publica um evento no Feed de forma idempotente (create + catch P2002 —
 * mesmo padrão desde a Fatia 4). Nunca lança erro se o evento já existe
 * (evento duplicado é esperado quando vários hooks tentam publicar o mesmo
 * fato — o primeiro vence, os demais são no-op silencioso). Se o evento
 * existia REVOGADO e o fato voltou a valer (ex.: venda reprocessada), ele é
 * reativado — mesma linha, nunca uma segunda.
 */
export async function publicarEventoFeed(input: PublicarEventoFeedInput) {
  const empresaId = await resolverEmpresa(input);
  try {
    const evento = await prisma.feedEvent.create({
      data: {
        empresaId,
        eventType: input.eventType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        visibility: input.visibility,
        lojaId: input.lojaId,
        actorId: input.actorId,
        subjectId: input.subjectId,
        templateData: input.templateData as Prisma.InputJsonValue,
        ...(input.ocorridoEm ? { createdAt: input.ocorridoEm } : {}),
      },
    });
    await registrarEventoAuditoria({ empresaId, acao: 'FEED_EVENT_CREATED', metadata: { feedEventId: evento.id, eventType: input.eventType } });
    return evento;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const chave = { eventType_sourceType_sourceId: { eventType: input.eventType, sourceType: input.sourceType, sourceId: input.sourceId } };
      await prisma.feedEvent.updateMany({ where: { eventType: input.eventType, sourceType: input.sourceType, sourceId: input.sourceId, revogadoEm: { not: null } }, data: { revogadoEm: null } });
      return prisma.feedEvent.findUniqueOrThrow({ where: chave });
    }
    throw err;
  }
}

/** Revoga (D4) — o fato que originou o evento deixou de valer. Idempotente. */
export async function revogarEventoFeed(eventType: string, sourceType: string, sourceId: string) {
  const r = await prisma.feedEvent.updateMany({ where: { eventType, sourceType, sourceId, revogadoEm: null }, data: { revogadoEm: new Date() } });
  return r.count;
}

/**
 * Listagem paginada (cursor, seção 117) filtrada por visibilidade real do
 * viewer (seção 36/105) DENTRO da empresa do viewer: COMPANY sempre visível;
 * STORE só se `lojaId` bater com a loja do viewer; PRIVATE nunca aparece no
 * feed geral. Revogados nunca aparecem.
 */
export async function listarFeed(empresaId: string, viewerLojaId: string, opcoes: { limite: number; cursor?: string; tipos?: string[] }) {
  const eventos = await prisma.feedEvent.findMany({
    where: {
      empresaId,
      revogadoEm: null,
      ...(opcoes.tipos ? { eventType: { in: opcoes.tipos } } : {}),
      OR: [{ visibility: 'COMPANY' }, { visibility: 'STORE', lojaId: viewerLojaId }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opcoes.limite,
    ...(opcoes.cursor ? { skip: 1, cursor: { id: opcoes.cursor } } : {}),
  });

  const idsVendedores = [...new Set(eventos.flatMap((e) => [e.actorId, e.subjectId]).filter((v): v is string => !!v))];
  const vendedores = await prisma.vendedor.findMany({ where: { id: { in: idsVendedores }, empresaId }, select: { id: true, nome: true } });
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

  return {
    eventos: eventos.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      visibility: e.visibility,
      createdAt: e.createdAt,
      lojaId: e.lojaId,
      subjectId: e.subjectId,
      subjectNome: e.subjectId ? (nomePorId.get(e.subjectId) ?? '—') : null,
      mensagem: (TEMPLATES_FEED[e.eventType] ?? (() => e.eventType))(e.templateData as Record<string, unknown>),
    })),
    proximoCursor: eventos.length === opcoes.limite ? eventos[eventos.length - 1].id : null,
  };
}
