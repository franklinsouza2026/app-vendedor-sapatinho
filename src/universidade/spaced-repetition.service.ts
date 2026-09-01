// ReviewSchedule / Spaced Repetition (Fatia 7.5E, seção 40-44) — algoritmo
// simples, explícito e testável (seção 42): errar sempre reseta pro
// estágio 0 (próxima revisão amanhã); acertar avança 1 estágio (nunca pula
// etapas). Só recomenda conteúdo PUBLISHED (seção 43).
import { prisma } from '../db';
import { ESTAGIOS_REVISAO_DIAS } from './constantes';

function proximaData(estagio: number, agora: Date): Date {
  const dias = ESTAGIOS_REVISAO_DIAS[Math.min(estagio, ESTAGIOS_REVISAO_DIAS.length - 1)];
  const proxima = new Date(agora);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

/** Chamado a cada resposta de questão de quiz (seção 41) — determinístico,
 * nunca IA. Erro reseta o estágio; acerto avança (ou, se não havia review
 * agendado ainda, cria um novo no estágio 0 mesmo acertando — a primeira
 * vez que uma questão é respondida sempre entra no ciclo). */
export async function registrarResultadoQuestao(userId: string, questionId: string, acertou: boolean, competencyId: string | null, agora: Date = new Date()) {
  const atual = await prisma.reviewSchedule.findUnique({ where: { userId_sourceType_sourceId: { userId, sourceType: 'QUESTION', sourceId: questionId } } });

  const novoEstagio = acertou ? (atual ? atual.intervalStage + 1 : 1) : 0;

  return prisma.reviewSchedule.upsert({
    where: { userId_sourceType_sourceId: { userId, sourceType: 'QUESTION', sourceId: questionId } },
    update: { intervalStage: novoEstagio, nextReviewAt: proximaData(novoEstagio, agora), status: 'PENDING', lastResult: acertou },
    create: { userId, sourceType: 'QUESTION', sourceId: questionId, competencyId, intervalStage: novoEstagio, nextReviewAt: proximaData(novoEstagio, agora), lastResult: acertou },
  });
}

export interface RevisaoPendente {
  id: string;
  questionId: string;
  questionStatement: string;
  opcoes: { id: string; text: string }[];
  lessonId: string;
  lessonTitle: string;
  nextReviewAt: Date;
}

/** Lista as revisões vencidas, sempre filtrando conteúdo PUBLISHED (seção
 * 43) — uma questão cujo quiz/aula saiu de circulação nunca é recomendada.
 * Nunca expõe `correct` — mesma disciplina do quiz normal (o vendedor
 * responde de novo pra provar que revisou, não só lê a resposta). */
export async function listarRevisoesPendentes(userId: string, agora: Date = new Date()): Promise<RevisaoPendente[]> {
  const pendentes = await prisma.reviewSchedule.findMany({
    where: { userId, sourceType: 'QUESTION', status: 'PENDING', nextReviewAt: { lte: agora } },
    orderBy: { nextReviewAt: 'asc' },
    take: 10,
  });
  if (pendentes.length === 0) return [];

  const questoes = await prisma.academyQuestion.findMany({
    where: { id: { in: pendentes.map((p) => p.sourceId) }, active: true },
    include: { quiz: { include: { aula: true } }, opcoes: { orderBy: { sortOrder: 'asc' } } },
  });

  const resultado: RevisaoPendente[] = [];
  for (const p of pendentes) {
    const q = questoes.find((x) => x.id === p.sourceId);
    if (!q || q.quiz.aula.status !== 'PUBLISHED' || !q.quiz.aula.active) continue; // nunca recomenda conteúdo fora do ar
    resultado.push({
      id: p.id,
      questionId: q.id,
      questionStatement: q.question,
      opcoes: q.opcoes.map((o) => ({ id: o.id, text: o.text })),
      lessonId: q.quiz.aula.id,
      lessonTitle: q.quiz.aula.title,
      nextReviewAt: p.nextReviewAt,
    });
  }
  return resultado;
}

/** Responder uma revisão é uma nova rodada do mesmo ciclo de spaced
 * repetition (não um domínio de reward separado, seção 23) — reagenda via
 * `registrarResultadoQuestao`, nunca toca AcademyProgress/recompensa. */
export async function responderRevisao(reviewId: string, userId: string, optionId: string, agora: Date = new Date()) {
  // Só aceita responder uma revisão que está de fato vencida (mesmo filtro
  // de `listarRevisoesPendentes`) — sem isso, o mesmo reviewId poderia ser
  // reenviado indefinidamente pra "farmar" avanço de estágio sem esperar o
  // intervalo real (replay).
  const review = await prisma.reviewSchedule.findFirst({ where: { id: reviewId, userId, sourceType: 'QUESTION', status: 'PENDING', nextReviewAt: { lte: agora } } });
  if (!review) return null;

  const questao = await prisma.academyQuestion.findUnique({ where: { id: review.sourceId }, include: { opcoes: true } });
  if (!questao) return null;

  const opcaoEscolhida = questao.opcoes.find((o) => o.id === optionId);
  const acertou = !!opcaoEscolhida?.correct;

  await registrarResultadoQuestao(userId, review.sourceId, acertou, review.competencyId);
  return { acertou };
}
