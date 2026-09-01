// Spaced Repetition (Fatia 7.5E, seção 40-44) — algoritmo determinístico:
// erro reseta o estágio pra 0, acerto avança 1 estágio (nunca pula etapas).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { registrarResultadoQuestao, listarRevisoesPendentes, responderRevisao } from './spaced-repetition.service';
import { prisma } from '../db';
import { ESTAGIOS_REVISAO_DIAS } from './constantes';

describe('Spaced Repetition — algoritmo determinístico', () => {
  it('errar cria/reseta pro estágio 0 e agenda pro dia seguinte', async () => {
    const userId = randomUUID();
    const questionId = randomUUID();
    const agora = new Date('2026-06-01T10:00:00Z');

    const review = await registrarResultadoQuestao(userId, questionId, false, null, agora);
    expect(review.intervalStage).toBe(0);
    const esperado = new Date(agora);
    esperado.setDate(esperado.getDate() + ESTAGIOS_REVISAO_DIAS[0]);
    expect(review.nextReviewAt.toISOString().slice(0, 10)).toBe(esperado.toISOString().slice(0, 10));
  });

  it('acertar sem histórico prévio entra no ciclo no estágio 1 (não pula direto pro fim)', async () => {
    const userId = randomUUID();
    const questionId = randomUUID();
    const review = await registrarResultadoQuestao(userId, questionId, true, null);
    expect(review.intervalStage).toBe(1);
  });

  it('acertos consecutivos avançam 1 estágio por vez, nunca pulam etapas', async () => {
    const userId = randomUUID();
    const questionId = randomUUID();
    const r1 = await registrarResultadoQuestao(userId, questionId, true, null);
    const r2 = await registrarResultadoQuestao(userId, questionId, true, null);
    const r3 = await registrarResultadoQuestao(userId, questionId, true, null);
    expect([r1.intervalStage, r2.intervalStage, r3.intervalStage]).toEqual([1, 2, 3]);
  });

  it('um erro depois de vários acertos reseta o estágio pra 0 (nunca reduz gradualmente)', async () => {
    const userId = randomUUID();
    const questionId = randomUUID();
    await registrarResultadoQuestao(userId, questionId, true, null);
    await registrarResultadoQuestao(userId, questionId, true, null);
    await registrarResultadoQuestao(userId, questionId, true, null);
    const depoisDoErro = await registrarResultadoQuestao(userId, questionId, false, null);
    expect(depoisDoErro.intervalStage).toBe(0);
  });

  it('listarRevisoesPendentes nunca recomenda questão de aula não PUBLISHED', async () => {
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-sr-${randomUUID()}`, title: 'T', description: 'd', status: 'DRAFT' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-sr-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'DRAFT' } });
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });
    const questao = await prisma.academyQuestion.create({
      data: { quizId: quiz.id, question: 'Pergunta?', opcoes: { create: [{ text: 'A', correct: true }, { text: 'B', correct: false }] } },
    });

    const userId = randomUUID();
    await registrarResultadoQuestao(userId, questao.id, false, null);

    const pendentes = await listarRevisoesPendentes(userId, new Date('2099-01-01'));
    expect(pendentes).toHaveLength(0); // aula em DRAFT, nunca recomendada
  });

  it('responderRevisao correto reagenda pra frente; errado reseta — nunca toca AcademyProgress/recompensa', async () => {
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-sr2-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-sr2-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });
    const questao = await prisma.academyQuestion.create({
      data: { quizId: quiz.id, question: 'Pergunta?', opcoes: { create: [{ text: 'Certa', correct: true }, { text: 'Errada', correct: false }] } },
      include: { opcoes: true },
    });
    const opcaoCerta = questao.opcoes.find((o) => o.correct)!;
    const opcaoErrada = questao.opcoes.find((o) => !o.correct)!;

    const userId = randomUUID();
    await registrarResultadoQuestao(userId, questao.id, false, null, new Date('2026-01-01'));
    const [pendente] = await listarRevisoesPendentes(userId, new Date('2099-01-01'));
    expect(pendente).toBeDefined();
    expect(pendente.opcoes.length).toBe(2);

    const resultado = await responderRevisao(pendente.id, userId, opcaoCerta.id);
    expect(resultado?.acertou).toBe(true);

    const progresso = await prisma.academyProgress.findUnique({ where: { vendedorId_lessonId: { vendedorId: userId, lessonId: aula.id } } });
    expect(progresso).toBeNull(); // nunca tocou AcademyProgress

    // responder de novo com o mesmo reviewId (já não está mais PENDING — nextReviewAt no futuro) -> null
    const respostaDuplicada = await responderRevisao(pendente.id, userId, opcaoErrada.id);
    expect(respostaDuplicada).toBeNull();
  });
});
