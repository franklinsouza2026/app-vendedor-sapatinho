// Auditoria de ações administrativas críticas (Fatia 7.5A, seção 42) —
// append-only por design: nenhuma rota de update/delete é exposta sobre
// AuditEvent, nem pra ADMIN. `metadata` nunca deve carregar CPF em claro,
// token ou senha — só contexto operacional (ex.: papel, lojaId, motivo).
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export type AcaoAuditoria =
  | 'USER_PREAUTHORIZED'
  | 'USER_ACTIVATED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_OFFBOARDED'
  | 'USER_REACTIVATED'
  | 'PASSWORD_CHANGED'
  | 'ERP_IDENTITY_LINKED'
  | 'ERP_IDENTITY_UNLINKED'
  // Admin AI Control Plane (Fatia 7.5B) — nunca com o valor da credencial no metadata.
  | 'AI_PROVIDER_CREDENTIAL_SET'
  | 'AI_PROVIDER_CREDENTIAL_UPDATED'
  | 'AI_PROVIDER_CREDENTIAL_REMOVED'
  | 'AI_PROVIDER_ACTIVATED'
  | 'AI_PROVIDER_DISABLED'
  | 'AI_MODEL_CHANGED'
  | 'AI_BUDGET_CHANGED'
  // CMS de treinamento (Fatia 7.5C) — nunca com conteúdo completo no metadata.
  | 'CONTENT_CREATED'
  | 'CONTENT_UPDATED'
  | 'CONTENT_SUBMITTED_FOR_REVIEW'
  | 'CONTENT_APPROVED'
  | 'CONTENT_PUBLISHED'
  | 'CONTENT_ARCHIVED'
  | 'QUESTION_CREATED'
  | 'QUESTION_UPDATED'
  | 'QUESTION_ARCHIVED'
  | 'MANDAMENTOS_CONTENT_UPDATED'
  | 'MANDAMENTOS_PUBLISHED'
  // Training Intelligence Platform (Fatia 7.5D) — nunca com prompt bruto/secret no metadata.
  | 'TRAINING_JOB_CREATED'
  | 'TRAINING_JOB_STARTED'
  | 'TRAINING_JOB_CANCELLED'
  | 'TRAINING_JOB_FAILED'
  | 'RESEARCH_COMPLETED'
  | 'CURATION_COMPLETED'
  | 'LESSON_DRAFT_GENERATED'
  | 'QUIZ_DRAFT_GENERATED'
  | 'SIMULATION_DRAFT_GENERATED'
  | 'GOVERNANCE_REVIEW_COMPLETED'
  | 'AI_CONTENT_APPROVED'
  | 'AI_CONTENT_REJECTED'
  | 'AI_CONTENT_PUBLISHED'
  // Universidade (Fatia 7.5E) — nunca com nota/avaliação confidencial completa no metadata.
  | 'UNIVERSITY_SCHOOL_CREATED'
  | 'UNIVERSITY_SCHOOL_UPDATED'
  | 'COMPETENCY_CREATED'
  | 'COMPETENCY_UPDATED'
  | 'COMPETENCY_TARGET_CHANGED'
  | 'COMPETENCY_EVIDENCE_ADDED'
  | 'CONTENT_COMPETENCY_MAPPED'
  | 'DEVELOPMENT_PLAN_CREATED'
  | 'DEVELOPMENT_PLAN_UPDATED'
  | 'DEVELOPMENT_PLAN_COMPLETED'
  | 'MANAGER_ASSESSMENT_CREATED'
  | 'CERTIFICATION_DEFINITION_CREATED'
  | 'CERTIFICATION_DEFINITION_UPDATED'
  | 'CERTIFICATION_ISSUED'
  | 'CERTIFICATION_EXPIRED'
  | 'RECERTIFICATION_STARTED'
  | 'LEARNING_PATH_RECOMMENDED'
  // Fatia 8 — Competições/Seasons/Ligas/Reconhecimento/Feed.
  | 'SEASON_CREATED'
  | 'SEASON_SCHEDULED'
  | 'SEASON_STARTED'
  | 'SEASON_FINISHED'
  | 'SEASON_CANCELLED'
  | 'COMPETITION_CREATED'
  | 'COMPETITION_UPDATED'
  | 'COMPETITION_STARTED'
  | 'COMPETITION_FINISHED'
  | 'COMPETITION_CANCELLED'
  | 'COMPETITION_PARTICIPANT_ADDED'
  | 'COMPETITION_DISQUALIFIED'
  | 'LEAGUE_CREATED'
  | 'LEAGUE_UPDATED'
  | 'LEAGUE_PROMOTED'
  | 'LEAGUE_RELEGATED'
  | 'RECOGNITION_CREATED'
  | 'SEASON_POINTS_ADDED'
  | 'SEASON_POINTS_COMPENSATED'
  | 'FEED_EVENT_CREATED'
  | 'COMPETITION_REWARD_GRANTED';

export async function registrarEventoAuditoria(params: {
  empresaId: string;
  acao: AcaoAuditoria;
  actorId?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      empresaId: params.empresaId,
      acao: params.acao,
      actorId: params.actorId,
      targetId: params.targetId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listarEventosAuditoria(empresaId: string, opcoes: { limite: number; cursor?: string }) {
  const { limite, cursor } = opcoes;
  const eventos = await prisma.auditEvent.findMany({
    where: { empresaId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limite,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      ator: { select: { id: true, nome: true } },
      alvo: { select: { id: true, nome: true } },
    },
  });

  return {
    eventos,
    proximoCursor: eventos.length === limite ? eventos[eventos.length - 1].id : null,
  };
}
