// Training Orchestrator — modelo de job e suas transições (seção 4/5/7/42/
// 45). Toda transição de estado é atômica (`updateMany` condicional), nunca
// ler-então-escrever, mesmo padrão de concorrência desde a Fatia 4.
import { Prisma, PublicoConteudo, TipoJobTreinamento } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { transicionarAula } from '../academia/admin-content.service';
import { verificarBudgetMensal } from '../ai-platform/budget.service';
import { TrainingIntelligenceError } from './types';

// Limite anti-abuso (seção 42) — evita um Admin disparar centenas de jobs
// pagos por engano/loop. Default v1 ajustável, mesma natureza de
// MISSOES_MAX_ATIVAS_POR_DIA (Fatia 7)/SIMULATION_MIN_TURNS_FOR_REWARD
// (Fatia 6): limite técnico de segurança, não uma régua de negócio — não
// exige a mesma evidência de "não inventar limiar numérico" que se aplicaria
// a moedas/XP.
export const TRAINING_JOB_DAILY_LIMIT_PER_ADMIN = 10;

export interface CriarJobInput {
  empresaId: string;
  requestedBy: string;
  type?: TipoJobTreinamento;
  topic: string;
  objective?: string | null;
  targetAudience?: PublicoConteudo;
  targetLessonId?: string;
  idempotencyKey?: string;
}

export async function verificarRateLimitTreinamento(empresaId: string, requestedBy: string, agora: Date = new Date()) {
  const desde = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const usadoHoje = await prisma.trainingIntelligenceJob.count({
    where: { empresaId, requestedBy, createdAt: { gte: desde } },
  });
  return { permitido: usadoHoje < TRAINING_JOB_DAILY_LIMIT_PER_ADMIN, limite: TRAINING_JOB_DAILY_LIMIT_PER_ADMIN, usadoHoje };
}

/** Cria o job (QUEUED) — idempotente por (empresaId, idempotencyKey) quando
 * fornecida: um double-click/retry do Admin nunca cria 2 jobs pro mesmo
 * pedido, devolve o já existente (seção 7). */
export async function criarJob(input: CriarJobInput) {
  const rateLimit = await verificarRateLimitTreinamento(input.empresaId, input.requestedBy);
  if (!rateLimit.permitido) {
    throw new TrainingIntelligenceError('rate_limited', `limite de ${rateLimit.limite} jobs de Training Intelligence por dia atingido`);
  }

  // Falha rápida na criação (seção 81) — nunca aceita um job pago pra só
  // falhar silenciosamente etapas depois. O CMS manual determinístico segue
  // funcionando normalmente mesmo com o budget esgotado (seção 69).
  const budget = await verificarBudgetMensal(input.empresaId);
  if (!budget.permitido) {
    throw new TrainingIntelligenceError('budget_exceeded', 'orçamento mensal de IA da empresa esgotado — não é possível iniciar um novo job agora');
  }

  if (input.idempotencyKey) {
    try {
      return await prisma.trainingIntelligenceJob.create({
        data: {
          empresaId: input.empresaId,
          requestedBy: input.requestedBy,
          type: input.type ?? 'PACOTE_TREINAMENTO',
          topic: input.topic,
          objective: input.objective ?? null,
          targetAudience: input.targetAudience ?? 'SELLER',
          targetLessonId: input.targetLessonId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return prisma.trainingIntelligenceJob.findFirstOrThrow({ where: { empresaId: input.empresaId, idempotencyKey: input.idempotencyKey } });
      }
      throw err;
    }
  }

  return prisma.trainingIntelligenceJob.create({
    data: {
      empresaId: input.empresaId,
      requestedBy: input.requestedBy,
      type: input.type ?? 'PACOTE_TREINAMENTO',
      topic: input.topic,
      objective: input.objective ?? null,
      targetAudience: input.targetAudience ?? 'SELLER',
      targetLessonId: input.targetLessonId,
    },
  });
}

/** Sempre filtrado por empresa — mesmo raciocínio anti-IDOR de todo o resto
 * do produto: um Admin de outra empresa nunca distingue "não existe" de
 * "existe mas não é seu". */
export async function buscarJob(jobId: string, empresaId: string) {
  const job = await prisma.trainingIntelligenceJob.findFirst({
    where: { id: jobId, empresaId },
    include: { sources: true, findings: true, cenarios: true },
  });
  if (!job) throw new TrainingIntelligenceError('not_found', 'job não encontrado');
  return job;
}

export async function listarJobs(empresaId: string) {
  return prisma.trainingIntelligenceJob.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' }, take: 100 });
}

/** Visão de revisão (seção 65): job + rascunhos que ele gerou (aula, questões,
 * cenário), sempre buscados por `trainingJobId`/`jobId` — nunca guardados
 * como um ponteiro solto que poderia ficar desatualizado. */
export async function detalharJobParaRevisao(jobId: string, empresaId: string) {
  const job = await buscarJob(jobId, empresaId);
  const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: jobId } });
  const questoes = aula ? await prisma.academyQuestion.findMany({ where: { trainingJobId: jobId }, include: { opcoes: true } }) : [];
  return { job, draftLesson: aula, draftQuestions: questoes, draftScenarios: job.cenarios };
}

export async function cancelarJob(jobId: string, empresaId: string, actorId: string) {
  const atual = await buscarJob(jobId, empresaId);
  const resultado = await prisma.trainingIntelligenceJob.updateMany({
    where: { id: jobId, empresaId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (resultado.count !== 1) {
    throw new TrainingIntelligenceError('invalid_transition', `job não pode ser cancelado no estado atual (${atual.status})`);
  }
  await registrarEventoAuditoria({ empresaId, acao: 'TRAINING_JOB_CANCELLED', actorId, metadata: { jobId } });
  return buscarJob(jobId, empresaId);
}

/**
 * Revisão humana (seção 29): Admin aprova ou rejeita o pacote gerado.
 * Rejeitar arquiva o rascunho (nunca aparece ao vendedor — mesma transição
 * `arquivar` do CMS manual, seção 66: sem atalho). Aprovar só registra a
 * decisão — publicar de fato continua exigindo os passos normais
 * submeter→aprovar→publicar em `/admin/training/lessons/:id/*` (o job não
 * pula etapa do lifecycle editorial).
 */
export async function revisarJob(jobId: string, empresaId: string, outcome: 'APPROVED' | 'REJECTED', notes: string | undefined, actorId: string) {
  const job = await buscarJob(jobId, empresaId);
  if (job.status !== 'WAITING_REVIEW') {
    throw new TrainingIntelligenceError('invalid_transition', `job não está aguardando revisão (estado atual: ${job.status})`);
  }

  if (outcome === 'REJECTED') {
    const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: jobId } });
    if (aula && aula.status !== 'ARCHIVED') {
      await transicionarAula(aula.id, 'arquivar', actorId);
    }
    const cenario = job.cenarios[0];
    if (cenario && cenario.status !== 'ARCHIVED') {
      await prisma.trainingScenarioDraft.update({ where: { id: cenario.id }, data: { status: 'ARCHIVED' } });
    }
  }

  const resultado = await prisma.trainingIntelligenceJob.updateMany({
    where: { id: jobId, empresaId, status: 'WAITING_REVIEW' },
    data: { status: 'COMPLETED', completedAt: new Date(), reviewOutcome: outcome, reviewNotes: notes },
  });
  if (resultado.count !== 1) {
    throw new TrainingIntelligenceError('invalid_transition', 'job mudou de estado durante a revisão — recarregue e tente de novo');
  }

  await registrarEventoAuditoria({
    empresaId,
    acao: outcome === 'APPROVED' ? 'AI_CONTENT_APPROVED' : 'AI_CONTENT_REJECTED',
    actorId,
    metadata: { jobId },
  });

  return buscarJob(jobId, empresaId);
}
