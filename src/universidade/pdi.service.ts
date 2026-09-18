// DevelopmentPlan / PDI (Fatia 7.5E, seção 31-34). Criação pode ser manual
// (Admin/Manager autorizado) ou sugerida pelo Gap Engine — sempre validado
// pelo backend, nunca um texto livre do LLM virando plano.
import { Prisma, StatusPDI, TipoItemPDI } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { UniversidadeError } from './constantes';
import { calcularScoreCompetencia } from './score-engine.service';
import { buscarCompetencia } from './competency.service';
import { publicarEventoFeed } from '../competicoes/feed.service';
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

  // Só 1 PDI ACTIVE por (subjectUserId, competencyId) — reforçado por índice
  // único parcial no banco (achado da auditoria seção 79: 2 criações
  // concorrentes da mesma competência podiam gerar 2 planos ativos
  // simultâneos; `concluirItemPDIPorConteudo` já presumia essa garantia em
  // comentário, sem nada de fato impedindo a duplicata).
  let plano;
  try {
    plano = await prisma.developmentPlan.create({
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UniversidadeError('already_exists', 'já existe um plano de desenvolvimento ativo para esta competência');
    }
    throw err;
  }

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'DEVELOPMENT_PLAN_CREATED', actorId: params.createdBy, metadata: { planId: plano.id, subjectUserId: params.subjectUserId } });
  return plano;
}

/**
 * Para onde cada tipo de conteúdo leva no app — as mesmas rotas reais do
 * "Para Você". Única fonte: a recomendação de IA também usa isto, senão um
 * cenário de simulação sugerido levaria o vendedor pra Academia.
 *
 * Prática livre e ação do gerente acontecem fora do app — sem destino.
 */
export const DESTINO_POR_TIPO: Record<TipoItemPDI, string | null> = {
  LESSON: '/academia',
  QUIZ: '/academia',
  TRACK: '/academia',
  SIMULATION: '/simulador',
  MISSION: '/missoes',
  REVIEW: '/universidade/revisao',
  PRACTICE: null,
  MANAGER_ACTION: null,
};

/**
 * Enriquece itens de PDI com TÍTULO e DESTINO (Etapa 2A).
 *
 * `DevelopmentPlanItem` guarda só `tipo` + `sourceId`, então a tela do vendedor
 * mostrava literalmente "LESSON / PENDING" — sem dizer QUAL aula nem como
 * chegar nela. Um plano que não diz o que fazer não é um plano.
 *
 * Resolvido na leitura, em LOTE (1 query por tipo), sem migration: o título
 * pertence ao conteúdo e mudaria se o Admin o renomeasse — copiá-lo para o item
 * criaria uma segunda fonte de verdade fadada a divergir.
 */
async function enriquecerItens<T extends { tipo: TipoItemPDI; sourceId: string | null }>(itens: T[]) {
  const idsDe = (tipos: TipoItemPDI[]) => itens.filter((i) => tipos.includes(i.tipo) && i.sourceId).map((i) => i.sourceId!);

  const lessonIds = idsDe(['LESSON']);
  const trackIds = idsDe(['TRACK']);
  // `sourceId` de um item QUIZ é o id do QUIZ, não o da aula (ver validarItem) —
  // procurar em AcademyLesson devolveria sempre null e a etapa voltaria a
  // aparecer como "Quiz" sem título, que é justamente o que isto corrige.
  const quizIds = idsDe(['QUIZ']);
  const scenarioIds = idsDe(['SIMULATION']);
  const missionIds = idsDe(['MISSION']);

  const [lessons, tracks, quizzes, scenarios, missions] = await Promise.all([
    lessonIds.length ? prisma.academyLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } }) : [],
    trackIds.length ? prisma.academyTrack.findMany({ where: { id: { in: trackIds } }, select: { id: true, title: true } }) : [],
    quizIds.length ? prisma.academyQuiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, aula: { select: { title: true } } } }) : [],
    scenarioIds.length ? prisma.simulationScenario.findMany({ where: { id: { in: scenarioIds } }, select: { id: true, title: true } }) : [],
    missionIds.length ? prisma.missionDefinition.findMany({ where: { id: { in: missionIds } }, select: { id: true, title: true } }) : [],
  ]);

  const titulos = new Map<string, string>();
  for (const x of [...lessons, ...tracks, ...scenarios, ...missions]) titulos.set(x.id, x.title);
  // Mesma convenção já usada pela recomendação de IA, pra o vendedor ver o
  // mesmo rótulo nos dois lugares.
  for (const q of quizzes) titulos.set(q.id, `Quiz — ${q.aula.title}`);

  return itens.map((item) => ({
    ...item,
    titulo: (item.sourceId && titulos.get(item.sourceId)) || null,
    href: DESTINO_POR_TIPO[item.tipo],
  }));
}

export async function buscarPDI(id: string) {
  const plano = await prisma.developmentPlan.findUnique({ where: { id }, include: { itens: { orderBy: { sortOrder: 'asc' } }, competencia: true } });
  if (!plano) throw new UniversidadeError('not_found', 'plano de desenvolvimento não encontrado');
  return { ...plano, itens: await enriquecerItens(plano.itens) };
}

export async function listarPDIsDoUsuario(subjectUserId: string, status?: StatusPDI) {
  const planos = await prisma.developmentPlan.findMany({
    where: { subjectUserId, ...(status ? { status } : {}) },
    include: { itens: { orderBy: { sortOrder: 'asc' } }, competencia: true },
    orderBy: { startedAt: 'desc' },
  });
  // Um único lote pra TODOS os itens de TODOS os planos — nunca 1 por plano.
  const todosItens = await enriquecerItens(planos.flatMap((p) => p.itens));
  const porId = new Map(todosItens.map((i) => [i.id, i]));
  return planos.map((p) => ({ ...p, itens: p.itens.map((i) => porId.get(i.id)!) }));
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
      const vendedor = await prisma.vendedor.findUnique({ where: { id: plano.subjectUserId }, select: { lojaId: true } });
      if (vendedor) {
        await publicarEventoFeed({ eventType: 'PDI_COMPLETED', sourceType: 'DEVELOPMENT_PLAN', sourceId: planId, visibility: 'STORE', lojaId: vendedor.lojaId, subjectId: plano.subjectUserId, templateData: { competencyName: plano.competencia.name } });
      }
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
