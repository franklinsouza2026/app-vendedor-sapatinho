// ManagerFollowUp (Fatia 9, seção 58-62) — agendamento simples (amanhã/3
// dias/próxima semana/data custom), sem push/e-mail/lembrete complexo. Serve
// de base pro "PENDÊNCIAS" (inbox.service.ts).
import { StatusFollowUp } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { ManagerError, sanitizarTextoLivre } from './constantes';

export interface CriarFollowUpInput {
  empresaId: string;
  lojaId: string;
  managerId: string;
  sellerId?: string;
  sourceType?: string;
  sourceId?: string;
  descricao: string;
  dueAt: Date;
}

export async function criarFollowUp(input: CriarFollowUpInput) {
  if (input.sellerId) await garantirVendedorNoEscopoDoGerente(input.sellerId, input.empresaId, input.lojaId);

  const followUp = await prisma.managerFollowUp.create({
    data: {
      empresaId: input.empresaId,
      lojaId: input.lojaId,
      managerId: input.managerId,
      sellerId: input.sellerId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      descricao: sanitizarTextoLivre(input.descricao),
      dueAt: input.dueAt,
    },
  });

  await registrarEventoAuditoria({ empresaId: input.empresaId, acao: 'FOLLOWUP_CREATED', actorId: input.managerId, metadata: { followUpId: followUp.id, sellerId: input.sellerId ?? null } });
  return followUp;
}

export async function listarFollowUps(empresaId: string, lojaId: string, filtro: { status?: StatusFollowUp[] } = {}) {
  return prisma.managerFollowUp.findMany({
    where: { empresaId, lojaId, status: { in: filtro.status ?? ['PENDING'] } },
    orderBy: { dueAt: 'asc' },
  });
}

async function buscarNoEscopo(empresaId: string, lojaId: string, id: string) {
  const followUp = await prisma.managerFollowUp.findFirst({ where: { id, empresaId, lojaId } });
  if (!followUp) throw new ManagerError('not_found', 'follow-up não encontrado');
  return followUp;
}

export async function concluirFollowUp(empresaId: string, lojaId: string, id: string, actorId: string) {
  await buscarNoEscopo(empresaId, lojaId, id);
  const resultado = await prisma.managerFollowUp.updateMany({ where: { id, empresaId, lojaId, status: 'PENDING' }, data: { status: 'DONE' } });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'FOLLOWUP_DONE', actorId, metadata: { followUpId: id } });
}

export async function dispensarFollowUp(empresaId: string, lojaId: string, id: string, actorId: string) {
  await buscarNoEscopo(empresaId, lojaId, id);
  const resultado = await prisma.managerFollowUp.updateMany({ where: { id, empresaId, lojaId, status: 'PENDING' }, data: { status: 'DISMISSED' } });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'FOLLOWUP_DISMISSED', actorId, metadata: { followUpId: id } });
}
