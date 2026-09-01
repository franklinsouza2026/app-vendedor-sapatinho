// Quiz determinístico (Fatia 6, seção "QUIZ"): gabarito e cálculo de score
// SEMPRE no backend — o LLM nunca decide resposta correta, o frontend nunca
// envia `correct=true`, só a opção escolhida por pergunta.
import { prisma } from '../db';
import { AcademyError } from './lesson.service';
import { concederRecompensaTreinamento, recompensaTreinamentoJaConcedida } from '../gamificacao/treinamento.service';
import { createLogger } from '../utils/logger';
import { gerarEvidenciaDeQuiz } from '../universidade/evidence.service';
import { concluirItemPDIPorConteudo } from '../universidade/pdi.service';
import { registrarResultadoQuestao } from '../universidade/spaced-repetition.service';

const log = createLogger('academia:quiz');

export interface RespostaQuizInput {
  questionId: string;
  optionId: string;
}

/** Sorteia N ids do pool, tentando não repetir exatamente o conjunto da
 * tentativa imediatamente anterior (seção 33/34). Bancos pequenos (pool <=
 * N) usam todo o pool sempre — fallback documentado, nunca falha. */
function selecionarQuestoesDinamicas(poolIds: string[], quantidade: number, ultimaSelecao: string[] | null): string[] {
  if (poolIds.length <= quantidade) return poolIds;

  function embaralhar(): string[] {
    const copia = [...poolIds];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia.slice(0, quantidade);
  }

  let selecao = embaralhar();
  if (ultimaSelecao) {
    const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
    if (mesmoConjunto(selecao, ultimaSelecao)) selecao = embaralhar(); // 1 nova tentativa, nunca loop
  }
  return selecao;
}

/**
 * Perguntas + alternativas SEM o campo `correct` — nunca expor o gabarito
 * antes da resposta. Quiz dinâmico (seção 30-34): se `questionsPerAttempt`
 * estiver configurado e o banco (pool de questões ativas) for maior que
 * ele, sorteia um subconjunto por tentativa e persiste em
 * `AcademyProgress.ultimaTentativaQuestoesIds` — `responderQuiz` só aceita
 * respostas para EXATAMENTE esse conjunto (nunca um conjunto diferente
 * escolhido pelo cliente). Sem blueprint configurado (a imensa maioria dos
 * quizzes hoje), comportamento idêntico ao legado: todas as perguntas.
 * CMS (Fatia 7.5C): mesmo gate de `status === 'PUBLISHED'` de
 * lesson.service.ts — sem ele, o quiz de uma aula ainda em DRAFT/REVIEW_
 * PENDING/APPROVED seria acessível (e respondível, com recompensa) por
 * qualquer vendedor que soubesse o id, direto por API.
 */
export async function getQuizParaResponder(lessonId: string, vendedorId: string) {
  const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId } });
  if (!aula || !aula.active || aula.status !== 'PUBLISHED') throw new AcademyError('not_found', 'aula não encontrada');

  const quiz = await prisma.academyQuiz.findUnique({
    where: { lessonId },
    include: { perguntas: { where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { opcoes: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!quiz) throw new AcademyError('not_found', 'esta aula não tem quiz');

  let perguntasParaMostrar = quiz.perguntas;

  if (quiz.questionsPerAttempt && quiz.perguntas.length > quiz.questionsPerAttempt) {
    const progresso = await prisma.academyProgress.findUnique({ where: { vendedorId_lessonId: { vendedorId, lessonId } } });
    const ultimaSelecao = (progresso?.ultimaTentativaQuestoesIds as string[] | null) ?? null;

    const idsEscolhidos = selecionarQuestoesDinamicas(
      quiz.perguntas.map((p) => p.id),
      quiz.questionsPerAttempt,
      ultimaSelecao
    );
    const idsSet = new Set(idsEscolhidos);
    perguntasParaMostrar = quiz.perguntas.filter((p) => idsSet.has(p.id));

    // Persiste ANTES de responder — é o que `responderQuiz` valida contra,
    // pra um cliente nunca poder submeter um conjunto diferente do exibido.
    const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
    await prisma.academyProgress.upsert({
      where: { vendedorId_lessonId: { vendedorId, lessonId } },
      update: { ultimaTentativaQuestoesIds: idsEscolhidos },
      create: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId, lessonId, status: 'IN_PROGRESS', ultimaTentativaQuestoesIds: idsEscolhidos },
    });
  }

  return {
    id: quiz.id,
    passingScore: quiz.passingScore,
    perguntas: perguntasParaMostrar.map((p) => ({
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
  if (!aula || !aula.active || aula.status !== 'PUBLISHED') throw new AcademyError('not_found', 'aula não encontrada');

  const quiz = await prisma.academyQuiz.findUnique({
    where: { lessonId },
    include: { perguntas: { include: { opcoes: true } } },
  });
  if (!quiz) throw new AcademyError('not_found', 'esta aula não tem quiz');

  const progressoExistente = await prisma.academyProgress.findUnique({ where: { vendedorId_lessonId: { vendedorId, lessonId } } });
  const conjuntoApresentado = (progressoExistente?.ultimaTentativaQuestoesIds as string[] | null) ?? null;

  // Quiz com blueprint dinâmico (seção 40 — anti-fraude): o vendedor só pode
  // responder EXATAMENTE o conjunto que `getQuizParaResponder` sorteou e
  // persistiu pra ele, nunca escolher um subconjunto próprio nem reenviar um
  // conjunto de uma tentativa anterior a essa.
  const perguntasEsperadas =
    quiz.questionsPerAttempt && conjuntoApresentado ? quiz.perguntas.filter((p) => conjuntoApresentado.includes(p.id)) : quiz.perguntas;

  if (respostas.length !== perguntasEsperadas.length || respostas.some((r) => !perguntasEsperadas.some((p) => p.id === r.questionId))) {
    throw new AcademyError('quiz_obrigatorio', 'responda exatamente as perguntas apresentadas nesta tentativa');
  }

  let acertos = 0;
  for (const pergunta of perguntasEsperadas) {
    const resposta = respostas.find((r) => r.questionId === pergunta.id);
    if (!resposta) continue; // pergunta não respondida — conta como erro
    const opcaoEscolhida = pergunta.opcoes.find((o) => o.id === resposta.optionId);
    const acertou = !!opcaoEscolhida?.correct;
    if (acertou) acertos += 1;

    // Universidade (Fatia 7.5E, seção 41) — spaced repetition por questão,
    // sempre (independente de aprovar o quiz inteiro); best-effort, nunca
    // bloqueia a resposta do quiz.
    try {
      const competencyIds = Array.isArray(pergunta.competencyIds) ? (pergunta.competencyIds as string[]) : [];
      await registrarResultadoQuestao(vendedorId, pergunta.id, acertou, competencyIds[0] ?? null);
    } catch (err) {
      log.error({ err, vendedorId, questionId: pergunta.id }, 'falha ao agendar revisão da questão — não bloqueia a resposta do quiz');
    }
  }

  const score = Math.round((acertos / perguntasEsperadas.length) * 100);
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

  // Universidade (Fatia 7.5E) — evidência sempre, aprovado ou não (um score
  // real de tentativa reprovada ainda é evidência real da competência
  // atual, seção 23: reward e evidence são domínios separados).
  await gerarEvidenciaDeQuiz(vendedorId, lessonId, quiz.id, score, quiz.tipo === 'DIAGNOSTIC');

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

    // Universidade (Fatia 7.5E) — só na 1ª aprovação real (mesma proteção
    // de idempotência da recompensa) evita duplicar o item de PDI.
    if (!quizJaConcedido) {
      await concluirItemPDIPorConteudo(vendedorId, 'QUIZ', quiz.id);
    }
    log.info({ vendedorId, lessonId, score }, 'quiz aprovado');
  }

  return { score, passingScore: quiz.passingScore, passed: passou, progresso };
}
