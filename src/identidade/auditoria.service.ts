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
  | 'ERP_IDENTITY_UNLINKED';

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
