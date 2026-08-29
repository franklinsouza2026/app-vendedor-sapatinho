import { describe, expect, it } from 'vitest';
import { getMemoria } from './memory.service';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';
import { AMOSTRA_MINIMA_BASELINE } from '../gamificacao/baseline.service';

function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe('getMemoria', () => {
  it('sem baseline suficiente, não deriva nenhum ponto forte/fraco (nunca inventa)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const memoria = await getMemoria(vendedor.id);

    expect(memoria.strengths).toEqual([]);
    expect(memoria.developmentAreas).toEqual([]);
    expect(memoria.summary).toBeNull();
  });

  it('identifica ticket médio como área de desenvolvimento quando está bem abaixo da baseline', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    for (let i = AMOSTRA_MINIMA_BASELINE; i >= 1; i--) {
      await criarIndicador(vendedor.id, new Date(diasAtras(i).getTime() + 10 * 3600 * 1000), { faturamento: 200, pa: 2, ticketMedio: 100 });
    }
    // hoje: ticket bem abaixo da baseline (100)
    await criarIndicador(vendedor.id, new Date(diasAtras(0).getTime() + 10 * 3600 * 1000), { faturamento: 60, pa: 2, ticketMedio: 60, numAtendimentos: 1 });

    const memoria = await getMemoria(vendedor.id);

    expect(memoria.developmentAreas).toContain('ticket médio');
    expect(memoria.currentFocus).toBe('ticket médio');
    expect(memoria.summary).toContain('Em desenvolvimento');
  });

  it('nunca guarda conteúdo emocional/pessoal — só métricas de performance', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const memoria = await getMemoria(vendedor.id);

    const camposPermitidos = ['strengths', 'developmentAreas', 'currentFocus', 'summary'];
    expect(Object.keys(memoria)).toEqual(expect.arrayContaining(camposPermitidos));
    expect(Object.keys(memoria)).toHaveLength(camposPermitidos.length);
  });
});
