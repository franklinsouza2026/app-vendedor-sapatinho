// Helpers só pra testes da Academia — cria trilha/aula (catálogo GLOBAL,
// code sempre novo via randomUUID) isoladas do conteúdo real semeado por
// content-seed.ts.
import { randomUUID } from 'node:crypto';
import { CategoriaPlaybook } from '@prisma/client';
import { prisma } from '../db';

export async function criarTrilhaTeste() {
  return prisma.academyTrack.create({
    data: {
      code: `trilha-teste-${randomUUID()}`,
      title: 'Trilha de teste',
      description: 'Trilha criada só para testes automatizados.',
      active: true,
      sortOrder: 0,
    },
  });
}

export interface AulaTesteOptions {
  playbookCategoria?: CategoriaPlaybook;
  active?: boolean;
}

export async function criarAulaTeste(trackId: string, opts: AulaTesteOptions = {}) {
  return prisma.academyLesson.create({
    data: {
      trackId,
      code: `aula-teste-${randomUUID()}`,
      title: 'Aula de teste',
      description: 'Aula criada só para testes automatizados.',
      content: 'Conteúdo de teste da aula.',
      origem: 'DEMONSTRATIVO',
      estimatedMinutes: 5,
      sortOrder: 0,
      active: opts.active ?? true,
      playbookCategoria: opts.playbookCategoria,
    },
  });
}

/** Aula + quiz de 1 pergunta/2 opções, sempre com o mesmo formato — nunca opcional, pra evitar `possibly undefined` nos testes. */
export async function criarAulaComQuizTeste(trackId: string, opts: { passingScore?: number } = {}) {
  const aula = await criarAulaTeste(trackId);
  const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: opts.passingScore ?? 70 } });
  const pergunta = await prisma.academyQuestion.create({ data: { quizId: quiz.id, question: 'Pergunta de teste?', sortOrder: 0 } });
  const opcaoCerta = await prisma.academyOption.create({ data: { questionId: pergunta.id, text: 'Resposta certa', correct: true, sortOrder: 0 } });
  const opcaoErrada = await prisma.academyOption.create({ data: { questionId: pergunta.id, text: 'Resposta errada', correct: false, sortOrder: 1 } });

  return { aula, quiz, pergunta, opcaoCerta, opcaoErrada };
}
