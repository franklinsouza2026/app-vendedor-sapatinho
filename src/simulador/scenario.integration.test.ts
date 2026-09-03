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

  it('GERENTE só vê cenários de gestão de pessoas, nunca cenários de venda (Fatia 9.6, seção 33)', async () => {
    const cenarioVenda = await criarCenarioTeste({ category: 'ABORDAGEM' });
    const cenarioGerencial = await criarCenarioTeste({ category: 'GESTAO_DE_PESSOAS' });

    const listaGerente = await listarCenariosAtivos('GERENTE');
    expect(listaGerente.map((c) => c.id)).toContain(cenarioGerencial.id);
    expect(listaGerente.map((c) => c.id)).not.toContain(cenarioVenda.id);

    const listaVendedor = await listarCenariosAtivos('VENDEDOR');
    expect(listaVendedor.map((c) => c.id)).toContain(cenarioVenda.id);
    expect(listaVendedor.map((c) => c.id)).not.toContain(cenarioGerencial.id);
  });

  it('resolverCenario rejeita categoria incompatível com o papel, mesmo com o ID exato (Fatia 9.6 — corrige achado de segurança: o filtro só existia na listagem, não na criação da sessão)', async () => {
    const cenarioVenda = await criarCenarioTeste({ category: 'ABORDAGEM' });
    const cenarioGerencial = await criarCenarioTeste({ category: 'GESTAO_DE_PESSOAS' });

    // VENDEDOR não pode abrir sessão de um cenário gerencial mesmo sabendo o ID.
    await expect(resolverCenario(cenarioGerencial.id, 'EASY', 'VENDEDOR')).rejects.toThrow();
    // GERENTE não pode abrir sessão de um cenário de venda mesmo sabendo o ID.
    await expect(resolverCenario(cenarioVenda.id, 'EASY', 'GERENTE')).rejects.toThrow();

    // O papel correto continua funcionando normalmente.
    await expect(resolverCenario(cenarioVenda.id, 'EASY', 'VENDEDOR')).resolves.toMatchObject({ id: cenarioVenda.id });
    await expect(resolverCenario(cenarioGerencial.id, 'EASY', 'GERENTE')).resolves.toMatchObject({ id: cenarioGerencial.id });
  });
});
