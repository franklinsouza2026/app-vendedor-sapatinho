import { describe, expect, it } from 'vitest';
import { avaliarCriterio, avaliarCriterioDesafio } from './criterio.service';
import { avaliarMetaDiaria } from '../gamificacao/motor.service';
import { criarFixtureEmpresa, criarMeta, criarIndicador } from '../gamificacao/test-helpers';
import { prisma } from '../db';
import { env } from '../config';

describe('avaliarCriterio — DAILY_GOAL', () => {
  it('não atingido sem meta cadastrada (progressoAlvo=0)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    const resultado = await avaliarCriterio('DAILY_GOAL', vendedor.id, { inicio: hoje, fim: hoje });
    expect(resultado.atingido).toBe(false);
    expect(resultado.progressoAlvo).toBe(0);
  });

  it('não atingido enquanto o motor não concedeu o tier 100 (evidência real, não recálculo)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    await criarIndicador(vendedor.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });

    // Indicador bate 100% mas o motor (avaliarMetaDiaria) ainda não rodou —
    // sem o evento real do motor, a missão não pode se dar por concluída.
    const resultado = await avaliarCriterio('DAILY_GOAL', vendedor.id, { inicio: hoje, fim: hoje });
    expect(resultado.atingido).toBe(false);
    expect(resultado.progressoAtual).toBe(1000);
    expect(resultado.progressoAlvo).toBe(1000);
  });

  it('atingido depois que o motor real concede o tier 100', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    await criarIndicador(vendedor.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });
    await avaliarMetaDiaria(vendedor.id, hoje);

    const resultado = await avaliarCriterio('DAILY_GOAL', vendedor.id, { inicio: hoje, fim: hoje });
    expect(resultado.atingido).toBe(true);
  });
});

describe('avaliarCriterio — COMPLETE_LESSON / PASS_QUIZ', () => {
  it('COMPLETE_LESSON atingido só depois de uma aula COMPLETED dentro da janela', async () => {
    const { vendedor, empresa } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-${vendedor.id}`, title: 't', description: 'd', active: true, sortOrder: 0 } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `aula-${vendedor.id}`, title: 'a', description: 'd', content: 'c', origem: 'DEMONSTRATIVO', estimatedMinutes: 5, sortOrder: 0, active: true },
    });
    void empresa;

    const antes = await avaliarCriterio('COMPLETE_LESSON', vendedor.id, { inicio: new Date(0), fim: new Date() });
    expect(antes.atingido).toBe(false);

    await prisma.academyProgress.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, lessonId: aula.id, status: 'COMPLETED', completedAt: new Date() },
    });

    const depois = await avaliarCriterio('COMPLETE_LESSON', vendedor.id, { inicio: new Date(0), fim: new Date() });
    expect(depois.atingido).toBe(true);
  });

  it('COMPLETE_LESSON ignora conclusão FORA da janela (antes do início da missão)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha2-${vendedor.id}`, title: 't', description: 'd', active: true, sortOrder: 0 } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `aula2-${vendedor.id}`, title: 'a', description: 'd', content: 'c', origem: 'DEMONSTRATIVO', estimatedMinutes: 5, sortOrder: 0, active: true },
    });
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.academyProgress.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, lessonId: aula.id, status: 'COMPLETED', completedAt: ontem },
    });

    const resultado = await avaliarCriterio('COMPLETE_LESSON', vendedor.id, { inicio: new Date(), fim: new Date() });
    expect(resultado.atingido).toBe(false);
  });
});

describe('avaliarCriterio — COMPLETE_SIMULATION', () => {
  it('exige turnCount >= SIMULATION_MIN_TURNS_FOR_REWARD (mesma elegibilidade da Fatia 6)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const cenario = await prisma.simulationScenario.create({
      data: {
        code: `cen-${vendedor.id}`,
        title: 't',
        description: 'd',
        category: 'GERAL',
        objective: 'o',
        active: true,
        playbookCategorias: [],
        criteriosAvaliacao: ['ABORDAGEM'],
        personasPorDificuldade: { EASY: { profile: 'p', initialNeed: 'n', hiddenNeeds: [], objections: [], behavior: 'b', successCondition: 's' } },
        maxTurnsPorDificuldade: { EASY: 8 },
      },
    });

    await prisma.simulationSession.create({
      data: {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId: vendedor.id,
        scenarioId: cenario.id,
        difficulty: 'EASY',
        personaSnapshot: {},
        maxTurns: 8,
        status: 'EVALUATED',
        turnCount: env.SIMULATION_MIN_TURNS_FOR_REWARD - 1, // abaixo do mínimo elegível
        evaluatedAt: new Date(),
      },
    });

    const resultado = await avaliarCriterio('COMPLETE_SIMULATION', vendedor.id, { inicio: new Date(0), fim: new Date() });
    expect(resultado.atingido).toBe(false);
  });
});

describe('avaliarCriterio — STREAK_3', () => {
  it('lê o contador real do StreakVendedor, nunca recalcula', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.streakVendedor.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, streakAtual: 2, maiorStreak: 2 },
    });

    const abaixo = await avaliarCriterio('STREAK_3', vendedor.id, { inicio: new Date(), fim: new Date() });
    expect(abaixo.atingido).toBe(false);
    expect(abaixo.progressoAtual).toBe(2);

    await prisma.streakVendedor.update({ where: { vendedorId: vendedor.id }, data: { streakAtual: 3 } });
    const atingiu = await avaliarCriterio('STREAK_3', vendedor.id, { inicio: new Date(), fim: new Date() });
    expect(atingiu.atingido).toBe(true);
  });
});

describe('avaliarCriterioDesafio', () => {
  it('3_LESSONS_WEEK conta aulas concluídas dentro da janela', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilhaw-${vendedor.id}`, title: 't', description: 'd', active: true, sortOrder: 0 } });
    for (let i = 0; i < 2; i++) {
      const aula = await prisma.academyLesson.create({
        data: { trackId: trilha.id, code: `aulaw-${vendedor.id}-${i}`, title: 'a', description: 'd', content: 'c', origem: 'DEMONSTRATIVO', estimatedMinutes: 5, sortOrder: i, active: true },
      });
      await prisma.academyProgress.create({
        data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, lessonId: aula.id, status: 'COMPLETED', completedAt: new Date() },
      });
    }

    const resultado = await avaliarCriterioDesafio('3_LESSONS_WEEK', vendedor.id, 3, new Date(0));
    expect(resultado.progressoAtual).toBe(2);
    expect(resultado.atingido).toBe(false);
  });
});
