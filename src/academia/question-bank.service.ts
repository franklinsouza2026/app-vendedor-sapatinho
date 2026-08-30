// Banco de questões administrável (Fatia 7.5C, seção 27-29). Editar uma
// questão já usada em tentativas passadas não recalcula scores já
// registrados (score é um snapshot no momento da resposta) — mas o mesmo id
// de questão passa a valer com o novo conteúdo dali em diante; snapshot
// completo por tentativa fica registrado como evolução futura (nenhuma
// necessidade real observada ainda).
import { DificuldadeQuestao } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';

async function resolverEmpresaUnica(): Promise<string> {
  const empresa = await prisma.empresa.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  return empresa.id;
}

export interface OpcaoInput {
  text: string;
  correct: boolean;
}

/** Cria o quiz da aula se ainda não existir, ou atualiza a configuração do existente. */
export async function definirQuizDaAula(lessonId: string, dados: { passingScore?: number; questionsPerAttempt?: number | null }, actorId: string) {
  const quiz = await prisma.academyQuiz.upsert({
    where: { lessonId },
    create: { lessonId, passingScore: dados.passingScore ?? 70, questionsPerAttempt: dados.questionsPerAttempt ?? null },
    update: { ...(dados.passingScore !== undefined ? { passingScore: dados.passingScore } : {}), ...(dados.questionsPerAttempt !== undefined ? { questionsPerAttempt: dados.questionsPerAttempt } : {}) },
  });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CONTENT_UPDATED', actorId, metadata: { tipo: 'quiz', lessonId } });
  return quiz;
}

export async function criarQuestao(
  dados: {
    quizId: string;
    question: string;
    difficulty?: DificuldadeQuestao;
    topic?: string;
    sourceContentId?: string;
    sortOrder?: number;
    opcoes: OpcaoInput[];
  },
  actorId: string,
  // Só a Training Intelligence Platform (Fatia 7.5D) passa isso — nunca
  // exposto no schema zod de `POST /admin/training/questions`. Questão de
  // origem IA nasce `active: false` (fora do banco publicado) até o Admin
  // revisar e ativar explicitamente (seção 21: "nunca direto no banco
  // publicado").
  origemInterna?: { origemEditorial: 'AI_RESEARCHED' | 'AI_GENERATED'; trainingJobId: string }
) {
  if (dados.opcoes.length < 2) throw new IdentidadeError(400, 'opcoes_insuficientes', 'a questão precisa de pelo menos 2 alternativas');
  if (!dados.opcoes.some((o) => o.correct)) throw new IdentidadeError(400, 'sem_resposta_correta', 'marque ao menos 1 alternativa como correta');

  const { opcoes, ...resto } = dados;
  const questao = await prisma.academyQuestion.create({
    data: {
      ...resto,
      createdBy: actorId,
      active: origemInterna ? false : true,
      origemEditorial: origemInterna?.origemEditorial ?? 'ADMIN_CURATED',
      trainingJobId: origemInterna?.trainingJobId,
      opcoes: { create: opcoes.map((o, idx) => ({ text: o.text, correct: o.correct, sortOrder: idx })) },
    },
    include: { opcoes: true },
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'QUESTION_CREATED', actorId, metadata: { id: questao.id, quizId: dados.quizId } });
  return questao;
}

export async function atualizarQuestao(
  id: string,
  dados: Partial<{ question: string; difficulty: DificuldadeQuestao; topic: string; sortOrder: number; opcoes: OpcaoInput[] }>,
  actorId: string
) {
  const { opcoes, ...resto } = dados;

  if (opcoes) {
    if (opcoes.length < 2) throw new IdentidadeError(400, 'opcoes_insuficientes', 'a questão precisa de pelo menos 2 alternativas');
    if (!opcoes.some((o) => o.correct)) throw new IdentidadeError(400, 'sem_resposta_correta', 'marque ao menos 1 alternativa como correta');
  }

  const questao = await prisma.$transaction(async (tx) => {
    if (opcoes) {
      await tx.academyOption.deleteMany({ where: { questionId: id } });
      await tx.academyOption.createMany({ data: opcoes.map((o, idx) => ({ questionId: id, text: o.text, correct: o.correct, sortOrder: idx })) });
    }
    return tx.academyQuestion.update({ where: { id }, data: { ...resto, version: { increment: 1 } }, include: { opcoes: true } });
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'QUESTION_UPDATED', actorId, metadata: { id } });
  return questao;
}

export async function arquivarQuestao(id: string, actorId: string) {
  await prisma.academyQuestion.update({ where: { id }, data: { active: false } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'QUESTION_ARCHIVED', actorId, metadata: { id } });
}

export async function listarQuestoesDoQuiz(quizId: string) {
  return prisma.academyQuestion.findMany({ where: { quizId }, orderBy: { sortOrder: 'asc' }, include: { opcoes: { orderBy: { sortOrder: 'asc' } } } });
}

export async function atualizarBlueprintQuiz(quizId: string, questionsPerAttempt: number | null, actorId: string) {
  const quiz = await prisma.academyQuiz.update({ where: { id: quizId }, data: { questionsPerAttempt } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'QUESTION_UPDATED', actorId, metadata: { quizId, questionsPerAttempt } });
  return quiz;
}
