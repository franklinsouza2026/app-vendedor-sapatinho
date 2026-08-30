import { describe, expect, it } from 'vitest';
import { listarCenariosAtivos, resolverCenario } from './scenario.service';
import { criarCenarioTeste } from './test-helpers';
import { prisma } from '../db';

describe('resolverCenario', () => {
  it('resolve persona e maxTurns corretos pra dificuldade pedida', async () => {
    const cenario = await criarCenarioTeste({ maxTurnsPorDificuldade: { EASY: 8, MEDIUM: 11, HARD: 15 } });

    const easy = await resolverCenario(cenario.id, 'EASY');
    const hard = await resolverCenario(cenario.id, 'HARD');

    expect(easy.maxTurns).toBe(8);
    expect(hard.maxTurns).toBe(15);
    expect(easy.persona.initialNeed).toContain('tênis casual');
  });

  it('lança erro quando o cenário está inativo', async () => {
    const cenario = await criarCenarioTeste({ active: false });
    await expect(resolverCenario(cenario.id, 'EASY')).rejects.toThrow(/inativo/);
  });

  it('lança erro quando a dificuldade pedida não tem persona cadastrada', async () => {
    const cenario = await criarCenarioTeste({ apenasDificuldades: ['EASY'] });
    await expect(resolverCenario(cenario.id, 'HARD')).rejects.toThrow(/persona não cadastrada/);
  });

  it('lança erro quando o cenário não existe', async () => {
    await expect(resolverCenario('00000000-0000-0000-0000-000000000000', 'EASY')).rejects.toThrow();
  });

  it('filtra critérios de avaliação inválidos guardados no JSON (defesa contra dado corrompido)', async () => {
    const cenario = await prisma.simulationScenario.create({
      data: {
        code: `cenario-teste-invalido-${crypto.randomUUID()}`,
        title: 'Cenário com critério inválido',
        description: 'teste',
        category: 'GERAL',
        objective: 'teste',
        active: true,
        playbookCategorias: ['ABORDAGEM'],
        criteriosAvaliacao: ['ABORDAGEM', 'CRITERIO_INEXISTENTE'],
        personasPorDificuldade: {
          EASY: { profile: 'p', initialNeed: 'n', hiddenNeeds: [], objections: [], behavior: 'b', successCondition: 's' },
        },
        maxTurnsPorDificuldade: { EASY: 8 },
      },
    });

    const resolvido = await resolverCenario(cenario.id, 'EASY');
    expect(resolvido.criteriosAvaliacao).toEqual(['ABORDAGEM']);
  });
});

describe('listarCenariosAtivos', () => {
  it('só lista cenários ativos', async () => {
    const ativo = await criarCenarioTeste({ active: true });
    const inativo = await criarCenarioTeste({ active: false });

    const lista = await listarCenariosAtivos();
    const ids = lista.map((c) => c.id);

    expect(ids).toContain(ativo.id);
    expect(ids).not.toContain(inativo.id);
  });
});
