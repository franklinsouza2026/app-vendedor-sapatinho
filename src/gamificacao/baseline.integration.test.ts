import { describe, expect, it } from 'vitest';
import { AMOSTRA_MINIMA_BASELINE, deltaPercentual, recomputarBaselines } from './baseline.service';
import { criarFixtureEmpresa, criarIndicador } from './test-helpers';

describe('recomputarBaselines', () => {
  it('marca amostra insuficiente quando há menos dias fechados que o mínimo', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let i = 1; i <= AMOSTRA_MINIMA_BASELINE - 1; i++) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      await criarIndicador(vendedor.id, new Date(dia.getTime() + 10 * 3600 * 1000), { faturamento: 100, pa: 2, ticketMedio: 50 });
    }

    const baselines = await recomputarBaselines(vendedor.id, hoje);
    for (const b of baselines) {
      expect(b.amostraSuficiente).toBe(false);
    }
  });

  it('calcula a média corretamente com amostra suficiente e nunca inclui o próprio dia avaliado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let i = 1; i <= AMOSTRA_MINIMA_BASELINE; i++) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      await criarIndicador(vendedor.id, new Date(dia.getTime() + 10 * 3600 * 1000), { faturamento: 100, pa: 2, ticketMedio: 50 });
    }
    // dado de HOJE com valor bem diferente — não pode entrar na baseline
    await criarIndicador(vendedor.id, new Date(hoje.getTime() + 10 * 3600 * 1000), { faturamento: 999999, pa: 999, ticketMedio: 999 });

    const baselines = await recomputarBaselines(vendedor.id, hoje);
    const faturamento = baselines.find((b) => b.metrica === 'FATURAMENTO_DIA')!;

    expect(faturamento.amostraSuficiente).toBe(true);
    expect(faturamento.valor).toBe(100); // média das 5 anteriores, não contaminada por hoje
  });

  it('deltaPercentual retorna null quando a baseline não tem amostra suficiente (nunca inventa média)', () => {
    const resultado = deltaPercentual(500, { metrica: 'PA', valor: 100, amostras: 1, amostraSuficiente: false });
    expect(resultado).toBeNull();
  });

  it('deltaPercentual calcula corretamente com baseline válida', () => {
    const resultado = deltaPercentual(120, { metrica: 'PA', valor: 100, amostras: 10, amostraSuficiente: true });
    expect(resultado).toBe(20);
  });
});
