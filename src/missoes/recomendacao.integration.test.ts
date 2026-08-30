import { describe, expect, it } from 'vitest';
import { recomendarMissoesDoDia } from './recomendacao.service';
import { criarFixtureEmpresa, criarMeta } from '../gamificacao/test-helpers';
import { env } from '../config';

describe('recomendarMissoesDoDia', () => {
  it('nunca recomenda mais que MISSOES_MAX_ATIVAS_POR_DIA', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarMeta(vendedor.id, 1000, new Date(new Date().setHours(0, 0, 0, 0)));

    const recomendadas = await recomendarMissoesDoDia(vendedor.id);
    expect(recomendadas.length).toBeLessThanOrEqual(env.MISSOES_MAX_ATIVAS_POR_DIA);
  });

  it('não recomenda DAILY_GOAL quando não há meta cadastrada (irrelevante — seção 26)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const recomendadas = await recomendarMissoesDoDia(vendedor.id);
    expect(recomendadas).not.toContain('DAILY_GOAL');
  });

  it('não recomenda PA_IMPROVEMENT/TICKET_IMPROVEMENT sem baseline com amostra suficiente', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    // vendedor recém-criado, zero histórico de indicadores — baseline "em formação"
    const recomendadas = await recomendarMissoesDoDia(vendedor.id);
    expect(recomendadas).not.toContain('PA_IMPROVEMENT');
    expect(recomendadas).not.toContain('TICKET_IMPROVEMENT');
  });

  it('prioriza DAILY_GOAL primeiro quando há meta cadastrada e ainda não atingida', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarMeta(vendedor.id, 1000, new Date(new Date().setHours(0, 0, 0, 0)));

    const recomendadas = await recomendarMissoesDoDia(vendedor.id);
    expect(recomendadas[0]).toBe('DAILY_GOAL');
  });

  it('sempre recomenda algo quando não há meta nem baseline (desenvolvimento/prática ainda fazem sentido)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const recomendadas = await recomendarMissoesDoDia(vendedor.id);
    expect(recomendadas.length).toBeGreaterThan(0);
    expect(recomendadas).toEqual(expect.arrayContaining(['STREAK_3']));
  });
});
