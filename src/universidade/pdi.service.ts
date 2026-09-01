// DevelopmentPlan / PDI (Fatia 7.5E, seção 31-34). Criação pode ser manual
// (Admin/Manager autorizado) ou sugerida pelo Gap Engine — sempre validado
// pelo backend, nunca um texto livre do LLM virando plano.
import { StatusPDI, TipoItemPDI } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { UniversidadeError } from './constantes';
import { calcularScoreCompetencia } from './score-engine.service';
import { buscarCompetencia } from './competency.service';
import { createLogger } from '../utils/logger';

const log = createLogger('universidade:pdi');

export interface ItemPDIInput {
  tipo: TipoItemPDI;
  sourceId?: string;
  required?: boolean;
}

/** Valida cada item contra o conteúdo real — nunca aceita um sourceId que
 * não existe, não está PUBLISHED, ou não é do tipo certo (seção 36/68). */
async function validarItem(item: ItemPDIInput): Promise<void> {
  if (!item.sourceId) return; // PRACTICE/MANAGER_ACTION/REVIEW podem não referenciar conteúdo específico
  switch (item.tipo) {
    case 'LESSON': {
      const aula = await prisma.academyLesson.findUnique({ where: { id: item.sourceId } });
      if (!aula || aula.status !== 'PUBLISHED') throw new UniversidadeError('invalid_reference', `aula ${item.sourceId} não existe ou não está publicada`);
      return;
    }
    case 'TRACK': {
      const trilha = await prisma.academyTrack.findUnique({ where: { id: item.sourceId } });
      if (!trilha || trilha.status !== 'PUBLISHED') throw new UniversidadeError('invalid_reference', `trilha ${item.sourceId} não existe ou não está publicada`);
      return;
    }
    case 'QUIZ': {
      const quiz = await prisma.academyQuiz.findUnique({ where: { id: item.sourceId }, include: { aula: true } });
      if (!quiz || quiz.aula.status !== 'PUBLISHED') throw new UniversidadeError('invalid_reference', `quiz ${item.sourceId} não existe ou a aula não está publicada`);
      return;
    }
    case 'SIMULATION': {
      const cenario = await prisma.simulationScenario.findUnique({ where: { id: item.sourceId } });
      if (!cenario || !cenario.active) throw new UniversidadeError('invalid_reference', `cenário ${item.sourceId} não existe ou está inativo`);
      return;
    }
    case 'MISSION': {
      const missao = await prisma.missionDefinition.findUnique({ where: { id: item.sourceId } });
      if (!missao || !missao.active) throw new UniversidadeError('invalid_reference', `missão ${item.sourceId} não existe ou está inativa`);
      return;
    }
    case 'PRACTICE':
    case 'MANAGER_ACTION':
    case 'REVIEW':
      return;
  }
}

export async function criarPDI(params: {
  subjectUserId: string;
  competencyId: string;
  targetScore: number;
  createdBy: string;
  targetDate?: Date;
  itens: ItemPDIInput[];
}) {
  await buscarCompetencia(params.competencyId);
  for (const item of params.itens) await validarItem(item);

  const baseline = await calcularScoreCompetencia(params.subjectUserId, params.competencyId);

  const plano = await prisma.developmentPlan.create({
    data: {
      subjectUserId: params.subjectUserId,
      competencyId: params.competencyId,
      baselineScore: baseline.score,
      targetScore: params.targetScore,
      createdBy: params.createdBy,
      targetDate: params.targetDate,
      itens: { create: params.itens.map((item, idx) => ({ tipo: item.tipo, sourceId: item.sourceId, sortOrder: idx, required: item.required ?? true })) },
    },
    include: { itens: true },
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'DEVELOPMENT_PLAN_CREATED', actorId: params.createdBy, metadata: { planId: plano.id, subjectUserId: params.subjectUserId } });
  return plano;
}

export async function buscarPDI(id: string) {
  const plano = await prisma.developmentPlan.findUnique({ where: { id }, include: { itens: { orderBy: { sortOrder: 'asc' } }, competencia: true } });
  if (!plano) throw new UniversidadeError('not_found', 'plano de desenvolvimento não encontrado');
  return plano;
}

export async function listarPDIsDoUsuario(subjectUserId: string, status?: StatusPDI) {
  return prisma.developmentPlan.findMany({
    where: { subjectUserId, ...(status ? { status } : {}) },
    include: { itens: { orderBy: { sortOrder: 'asc' } }, competencia: true },
    orderBy: { startedAt: 'desc' },
  });
}

async function transicionarPDI(id: string, de: StatusPDI[], para: StatusPDI, actorId: string, acao: 'DEVELOPMENT_PLAN_UPDATED' | 'DEVELOPMENT_PLAN_COMPLETED') {
  const atual = await buscarPDI(id);
  const resultado = await prisma.developmentPlan.updateMany({
    where: { id, status: { in: de } },
    data: { status: para, ...(para === 'COMPLETED' ? { completedAt: new Date() } : {}) },
  });
  if (resultado.count !== 1) throw new UniversidadeError('invalid_transition', `plano não está em um estado válido para esta transição (estado atual: ${atual.status})`);
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao, actorId, metadata: { planId: id } });
  return buscarPDI(id);
}

export const pausarPDI = (id: string, actorId: string) => transicionarPDI(id, ['ACTIVE'], 'PAUSED', actorId, 'DEVELOPMENT_PLAN_UPDATED');
export const retomarPDI = (id: string, actorId: string) => transicionarPDI(id, ['PAUSED'], 'ACTIVE', actorId, 'DEVELOPMENT_PLAN_UPDATED');
export const cancelarPDI = (id: string, actorId: string) => transicionarPDI(id, ['ACTIVE', 'PAUSED'], 'CANCELLED', actorId, 'DEVELOPMENT_PLAN_UPDATED');

/** Marca um item como concluído — chamado pelos hooks de conclusão real
 * (aula/quiz/simulação/missão), nunca por um clique livre do vendedor
 * "marcando" progresso sem evidência (seção 32/34). Se todos os itens
 * obrigatórios terminarem, o plano inteiro conclui. */
export async function concluirItemPDI(planId: string, tipo: TipoItemPDI, sourceId: string) {
  const item = await prisma.developmentPlanItem.findFirst({ where: { planId, tipo, sourceId, status: { in: ['PENDING', 'IN_PROGRESS'] } } });
  if (!item) return null;

  await prisma.developmentPlanItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

  const plano = await buscarPDI(planId);
  const pendentesObrigatorios = plano.itens.filter((i) => i.required && i.status !== 'COMPLETED' && i.status !== 'SKIPPED');
  if (pendentesObrigatorios.length === 0 && plano.status === 'ACTIVE') {
    // Transição condicional (mesmo padrão desde a Fatia 4) — sob 2 conclusões
    // concorrentes do último item obrigatório, só uma efetivamente transiciona
    // o plano; `count === 0` na perdedora evita um segundo evento de auditoria
    // duplicado pra uma conclusão que, do ponto de vista do plano, já aconteceu.
    const resultado = await prisma.developmentPlan.updateMany({ where: { id: planId, status: 'ACTIVE' }, data: { status: 'COMPLETED', completedAt: new Date() } });
    if (resultado.count === 1) {
      await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'DEVELOPMENT_PLAN_COMPLETED', actorId: plano.subjectUserId, metadata: { planId } });
    }
  }
  return item;
}

/** Conclui o item correspondente em QUALQUER plano ativo do usuário que
 * referencie este conteúdo (um vendedor pode ter só 1 PDI ativo por
 * competência, mas o mesmo conteúdo pode aparecer em planos de
 * competências diferentes) — chamado pelos hooks de conclusão real. */
export async function concluirItemPDIPorConteudo(subjectUserId: string, tipo: TipoItemPDI, sourceId: string) {
  // Best-effort (mesma disciplina de evidence.service.ts) — nunca bloqueia
  // o fluxo real de conclusão (aula/quiz/simulação/missão) que chamou isto.
  try {
    const planosAtivos = await prisma.developmentPlan.findMany({ where: { subjectUserId, status: 'ACTIVE' }, select: { id: true } });
    for (const p of planosAtivos) {
      await concluirItemPDI(p.id, tipo, sourceId);
    }
  } catch (err) {
    log.error({ err, subjectUserId, tipo, sourceId }, 'falha ao concluir item de PDI — não bloqueia o fluxo principal');
  }
}

/** Comparação ANTES/AGORA/DELTA (seção 55/58/59) — só com dados suficientes
 * dos dois lados; nunca narrativa de IA como prova (seção 56). */
export async function evolucaoDoPlano(planId: string) {
  const plano = await buscarPDI(planId);
  if (plano.status !== 'COMPLETED' || plano.baselineScore === null) return null;
  const atual = await calcularScoreCompetencia(plano.subjectUserId, plano.competencyId);
  if (atual.status === 'NOT_ENOUGH_DATA' || atual.score === null) return null;
  return { antes: plano.baselineScore, agora: atual.score, delta: atual.score - plano.baselineScore };
}
