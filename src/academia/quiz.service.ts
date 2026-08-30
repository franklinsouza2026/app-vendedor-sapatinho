// Quiz determinístico (Fatia 6, seção "QUIZ"): gabarito e cálculo de score
// SEMPRE no backend — o LLM nunca decide resposta correta, o frontend nunca
// envia `correct=true`, só a opção escolhida por pergunta.
import { prisma } from '../db';
import { AcademyError } from './lesson.service';
import { concederRecompensaTreinamento, recompensaTreinamentoJaConcedida } from '../gamificacao/treinamento.service';
import { createLogger } from '../utils/logger';

const log = createLogger('academia:quiz');

export interface RespostaQuizInput {
  questionId: string;
  optionId: string;
}

/** Perguntas + alternativas SEM o campo `correct` — nunca expor o gabarito antes da resposta. */
export async function getQuizParaResponder(lessonId: string) {
  const quiz = await prisma.academyQuiz.findUnique({
    where: { lessonId },
    include: { perguntas: { orderBy: { sortOrder: 'asc' }, include: { opcoes: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!quiz) throw new AcademyError('not_found', 'esta aula não tem quiz');

  return {
    id: quiz.id,
    passingScore: quiz.passingScore,
    perguntas: quiz.perguntas.map((p) => ({
      id: p.id,
      question: p.question,
      opcoes: p.opcoes.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

/**
 * Valida as respostas contra o gabarito real do banco, calcula o score
 * (0-100), decide aprovação e — se aprovado pela 1ª vez — conclui a aula e
 * concede as duas recompensas elegíveis (QUIZ_APROVADO sempre;
 * TREINAMENTO_CONCLUIDO porque a aula com quiz só conclui ao passar —
 * decisão documentada na Fatia 6/05-Decisoes-e-Tradeoffs.md).
 */
export async function responderQuiz(lessonId: string, vendedorId: string, respostas: RespostaQuizInput[]) {
  const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId } });
  if (!aula || !aula.active) throw new AcademyError('not_found', 'aula não encontrada');

  const quiz = await prisma.academyQuiz.findUnique({
    where: { lessonId },
    include: { perguntas: { include: { opcoes: true } } },
  });
  if (!quiz) throw new AcademyError('not_found', 'esta aula não tem quiz');

  if (respostas.length !== quiz.perguntas.length) {
    throw new AcademyError('quiz_obrigatorio', 'responda todas as perguntas do quiz');
  }

  let acertos = 0;
  for (const pergunta of quiz.perguntas) {
    const resposta = respostas.find((r) => r.questionId === pergunta.id);
    if (!resposta) continue; // pergunta não respondida — conta como erro
    const opcaoEscolhida = pergunta.opcoes.find((o) => o.id === resposta.optionId);
    if (opcaoEscolhida?.correct) acertos += 1;
  }

  const score = Math.round((acertos / quiz.perguntas.length) * 100);
  const passou = score >= quiz.passingScore;

  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });

  const progresso = await prisma.academyProgress.upsert({
    where: { vendedorId_lessonId: { vendedorId, lessonId } },
    update: {
      quizScore: score,
      quizPassed: passou,
      status: passou ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: passou ? new Date() : null,
    },
    create: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      lessonId,
      quizScore: score,
      quizPassed: passou,
      status: passou ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: passou ? new Date() : null,
    },
  });

  if (passou) {
    const idempotencyKeyQuiz = `academia-quiz-${vendedorId}-${lessonId}`;
    const idempotencyKeyAula = `academia-aula-${vendedorId}-${lessonId}`;

    const [quizJaConcedido, aulaJaConcedida] = await Promise.all([
      recompensaTreinamentoJaConcedida(idempotencyKeyQuiz),
      recompensaTreinamentoJaConcedida(idempotencyKeyAula),
    ]);

    if (!quizJaConcedido) {
      await concederRecompensaTreinamento({
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId,
        tipoEvento: 'QUIZ_APROVADO',
        referenciaTipo: 'ACADEMIA_QUIZ',
        referenciaId: quiz.id,
        idempotencyKey: idempotencyKeyQuiz,
      });
    }
    if (!aulaJaConcedida) {
      await concederRecompensaTreinamento({
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId,
        tipoEvento: 'TREINAMENTO_CONCLUIDO',
        referenciaTipo: 'ACADEMIA_AULA',
        referenciaId: lessonId,
        idempotencyKey: idempotencyKeyAula,
      });
    }
    log.info({ vendedorId, lessonId, score }, 'quiz aprovado');
  }

  return { score, passingScore: quiz.passingScore, passed: passou, progresso };
}
