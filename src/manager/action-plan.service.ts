// ManagerActionPlan (Fatia 9, seção 19-23) — plano de ação do gerente sobre
// SELLER/TEAM/STORE. Backend-autoritativo: o cliente nunca envia
// `completed`/`success`/`impact` — só o backend deriva status a partir de
// transições explícitas e validadas (mesmo padrão de idempotência atômica
// via `updateMany` + `count===1` já usado em Season/Competition/PDI).
import { StatusItemPlanoAcao, StatusPlanoAcao, TipoItemPlanoAcao, TipoSujeitoPlanoAcao } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { ManagerError, sanitizarTextoLivre } from './constantes';

export interface CriarPlanoInput {
  empresaId: string;
  lojaId: string;
  subjectType: TipoSujeitoPlanoAcao;
  subjectId?: string;
  title: string;
  description?: string;
  sourceAlertId?: string;
  createdBy: string;
  itens: { tipo: TipoItemPlanoAcao; descricao: string }[];
}

export async function criarPlanoDeAcao(input: CriarPlanoInput) {
  if (input.subjectType === 'SELLER') {
    if (!input.subjectId) throw new ManagerError('invalid_reference', 'subjectId é obrigatório para subjectType SELLER');
    await garantirVendedorNoEscopoDoGerente(input.subjectId, input.empresaId, input.lojaId);
  }

  const plano = await prisma.managerActionPlan.create({
    data: {
      empresaId: input.empresaId,
      lojaId: input.lojaId,
      subjectType: input.subjectType,
      subjectId: input.subjectType === 'SELLER' ? input.subjectId : null,
      title: sanitizarTextoLivre(input.title),
      description: input.description ? sanitizarTextoLivre(input.description) : null,
      sourceAlertId: input.sourceAlertId,
      createdBy: input.createdBy,
      status: 'DRAFT',
      itens: { create: input.itens.map((i) => ({ tipo: i.tipo, descricao: sanitizarTextoLivre(i.descricao) })) },
    },
    include: { itens: true },
  });

  await registrarEventoAuditoria({ empresaId: input.empresaId, acao: 'ACTION_PLAN_CREATED', actorId: input.createdBy, metadata: { planId: plano.id, subjectType: plano.subjectType, subjectId: plano.subjectId } });
  return plano;
}

export async function buscarPlanoNoEscopo(empresaId: string, lojaId: string, planId: string) {
  const plano = await prisma.managerActionPlan.findFirst({ where: { id: planId, empresaId, lojaId }, include: { itens: true } });
  if (!plano) throw new ManagerError('not_found', 'plano de ação não encontrado');
  return plano;
}

export async function listarPlanos(empresaId: string, lojaId: string, filtro: { status?: StatusPlanoAcao[]; subjectId?: string } = {}) {
  return prisma.managerActionPlan.findMany({
    where: { empresaId, lojaId, ...(filtro.status ? { status: { in: filtro.status } } : {}), ...(filtro.subjectId ? { subjectId: filtro.subjectId } : {}) },
    include: { itens: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function ativarPlano(empresaId: string, lojaId: string, planId: string, actorId: string) {
  await buscarPlanoNoEscopo(empresaId, lojaId, planId);
  const resultado = await prisma.managerActionPlan.updateMany({ where: { id: planId, empresaId, lojaId, status: 'DRAFT' }, data: { status: 'ACTIVE', startAt: new Date() } });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'ACTION_PLAN_UPDATED', actorId, metadata: { planId, transicao: 'ACTIVE' } });
}

export async function cancelarPlano(empresaId: string, lojaId: string, planId: string, actorId: string) {
  await buscarPlanoNoEscopo(empresaId, lojaId, planId);
  const resultado = await prisma.managerActionPlan.updateMany({ where: { id: planId, empresaId, lojaId, status: { in: ['DRAFT', 'ACTIVE'] } }, data: { status: 'CANCELLED' } });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'ACTION_PLAN_CANCELLED', actorId, metadata: { planId } });
}

/** Conclui 1 item — atômico (2 chamadas concorrentes pro MESMO item nunca
 * disparam 2 eventos de auditoria). Nunca completa o plano sozinho: o
 * gerente decide explicitamente quando o PLANO inteiro está concluído
 * (seção 21) — "todos os itens completos" é só um indicador exibido, não
 * uma transição automática. */
export async function concluirItem(empresaId: string, lojaId: string, planId: string, itemId: string, actorId: string) {
  const plano = await buscarPlanoNoEscopo(empresaId, lojaId, planId);
  if (plano.status !== 'ACTIVE') throw new ManagerError('invalid_transition', 'só é possível concluir itens de um plano ATIVO');

  const resultado = await prisma.managerActionItem.updateMany({
    where: { id: itemId, planId, status: 'PENDING' as StatusItemPlanoAcao },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'ACTION_PLAN_ITEM_COMPLETED', actorId, metadata: { planId, itemId } });
}

/** Conclui o plano inteiro — transação atômica (transição de status +
 * nunca deixa itens pendentes "esquecidos" sem refletir no `completedAt` do
 * plano), mesmo padrão de `finalizarCompetition` da Fatia 8. */
export async function concluirPlano(empresaId: string, lojaId: string, planId: string, actorId: string) {
  await buscarPlanoNoEscopo(empresaId, lojaId, planId);

  const jaConcluido = await prisma.$transaction(async (tx) => {
    const resultado = await tx.managerActionPlan.updateMany({ where: { id: planId, empresaId, lojaId, status: 'ACTIVE' }, data: { status: 'COMPLETED', completedAt: new Date() } });
    return resultado.count === 0;
  });

  if (!jaConcluido) await registrarEventoAuditoria({ empresaId, acao: 'ACTION_PLAN_COMPLETED', actorId, metadata: { planId } });
}
