import { describe, expect, it } from 'vitest';
import { listarTrilhas, getTrilhaDetalhada } from './track.service';
import { getProgressoGeral } from './progress.service';
import { concluirAula } from './lesson.service';
import { criarTrilhaTeste, criarAulaTeste } from './test-helpers';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

describe('listarTrilhas / getTrilhaDetalhada', () => {
  it('lista só trilhas/aulas ativas, com status por vendedor', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);
    await criarAulaTeste(trilha.id, { active: false }); // inativa — nunca deve aparecer

    const trilhas = await listarTrilhas(vendedor.id);
    const encontrada = trilhas.find((t) => t.id === trilha.id)!;

    expect(encontrada.aulas).toHaveLength(1);
    expect(encontrada.aulas[0].id).toBe(aula.id);
    expect(encontrada.aulas[0].status).toBe('NOT_STARTED');
  });

  it('getTrilhaDetalhada retorna null pra trilha inexistente', async () => {
    expect(await getTrilhaDetalhada('00000000-0000-0000-0000-000000000000', 'x')).toBeNull();
  });

  it('reflete o status COMPLETED de uma aula concluída', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);
    await concluirAula(aula.id, vendedor.id);

    const detalhe = await getTrilhaDetalhada(trilha.id, vendedor.id);
    expect(detalhe!.aulas.find((a) => a.id === aula.id)!.status).toBe('COMPLETED');
  });
});

describe('getProgressoGeral', () => {
  it('calcula percentual por trilha e geral, sempre a partir do progresso real do vendedor', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula1 = await criarAulaTeste(trilha.id);
    await criarAulaTeste(trilha.id);
    await concluirAula(aula1.id, vendedor.id);

    const progresso = await getProgressoGeral(vendedor.id);
    const trilhaProgresso = progresso.trilhas.find((t) => t.id === trilha.id)!;

    expect(trilhaProgresso.totalAulas).toBe(2);
    expect(trilhaProgresso.aulasConcluidas).toBe(1);
    expect(trilhaProgresso.percentual).toBe(50);
  });

  it('progresso de um vendedor nunca conta aulas concluídas por outro', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);
    await concluirAula(aula.id, vendedorA.id);

    const progressoB = await getProgressoGeral(vendedorB.id);
    const trilhaB = progressoB.trilhas.find((t) => t.id === trilha.id)!;
    expect(trilhaB.aulasConcluidas).toBe(0);
  });
});
