// Score Engine + Gap Engine (Fatia 7.5E) — 100% determinístico, fixtures
// explícitas, nenhuma chamada de IA.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { calcularScoreCompetencia, calcularGap } from './score-engine.service';

async function criarCompetenciaTeste() {
  return prisma.competency.create({ data: { code: `comp-${randomUUID()}`, name: 'Competência Teste', description: 'd' } });
}

describe('CompetencyScoreEngine', () => {
  it('NOT_ENOUGH_DATA com menos evidências que o mínimo', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    await prisma.competencyEvidence.create({ data: { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 80 } });

    const resultado = await calcularScoreCompetencia(userId, competencia.id);
    expect(resultado.status).toBe('NOT_ENOUGH_DATA');
    expect(resultado.score).toBeNull();
  });

  it('calcula média ponderada exata com fixtures conhecidas (peso QUIZ=1.0, SIMULATION=1.2)', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 80 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'SIMULATION', normalizedScore: 60 },
      ],
    });

    // (80*1.0 + 60*1.2) / (1.0 + 1.2) = (80 + 72) / 2.2 = 152/2.2 = 69.09 -> 69
    const resultado = await calcularScoreCompetencia(userId, competencia.id);
    expect(resultado.status).toBe('OK');
    expect(resultado.score).toBe(69);
    expect(resultado.evidenceCount).toBe(2);
  });

  it('evidência expirada (validUntil no passado) nunca entra na média', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 100, validUntil: ontem },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 50 },
      ],
    });

    // só a segunda evidência é válida -> NOT_ENOUGH_DATA (1 < mínimo de 2)
    const resultado = await calcularScoreCompetencia(userId, competencia.id);
    expect(resultado.status).toBe('NOT_ENOUGH_DATA');
  });

  it('confidence HIGH exige >=4 evidências, >=2 fontes distintas e recência <=90 dias', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 80 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 85 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'SIMULATION', normalizedScore: 75 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'SIMULATION', normalizedScore: 78 },
      ],
    });

    const resultado = await calcularScoreCompetencia(userId, competencia.id);
    expect(resultado.confidence).toBe('HIGH');
  });

  it('confidence LOW quando a evidência mais recente tem mais de 180 dias', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    const antigo = new Date();
    antigo.setDate(antigo.getDate() - 200);
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 80, occurredAt: antigo, validUntil: new Date('2099-01-01') },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 85, occurredAt: antigo, validUntil: new Date('2099-01-01') },
      ],
    });

    const resultado = await calcularScoreCompetencia(userId, competencia.id);
    expect(resultado.confidence).toBe('LOW');
  });
});

describe('CompetencyGapEngine', () => {
  it('gap = target - score quando score < target; nunca negativo', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    await prisma.competencyTarget.create({ data: { competencyId: competencia.id, papel: 'VENDEDOR', targetScore: 75 } });
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 55 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 55 },
      ],
    });

    const gap = await calcularGap(userId, competencia.id, 'VENDEDOR');
    expect(gap.score).toBe(55);
    expect(gap.target).toBe(75);
    expect(gap.gap).toBe(20);
    expect(gap.priority).toBe('MEDIUM'); // gap>=10 e <25 -> MEDIUM (>=25 seria HIGH)
  });

  it('score acima do target nunca gera gap negativo (sempre 0)', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();
    await prisma.competencyTarget.create({ data: { competencyId: competencia.id, papel: 'VENDEDOR', targetScore: 50 } });
    await prisma.competencyEvidence.createMany({
      data: [
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 90 },
        { subjectUserId: userId, competencyId: competencia.id, sourceType: 'QUIZ', normalizedScore: 90 },
      ],
    });

    const gap = await calcularGap(userId, competencia.id, 'VENDEDOR');
    expect(gap.gap).toBe(0);
    expect(gap.priority).toBe('LOW');
  });

  it('sem evidência suficiente, gap retorna NOT_ENOUGH_DATA com target ainda calculado (default 70 sem target explícito)', async () => {
    const competencia = await criarCompetenciaTeste();
    const userId = randomUUID();

    const gap = await calcularGap(userId, competencia.id, 'VENDEDOR');
    expect(gap.status).toBe('NOT_ENOUGH_DATA');
    expect(gap.score).toBeNull();
    expect(gap.target).toBe(70);
  });
});
