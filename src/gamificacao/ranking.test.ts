import { describe, expect, it } from 'vitest';
import { diasTranscorridos } from './ranking.service';

// Regressão: coletarDadosVendedor comparava a SOMA de faturamento do período
// (SEMANA/MES) direto contra a baseline pessoal, que é sempre uma MÉDIA DIÁRIA
// — inflando o delta de evolução em ~7x/~30x. A correção divide o realizado do
// período pelo número de dias transcorridos antes de comparar com a baseline.
describe('diasTranscorridos', () => {
  it('retorna 1 para o período DIA (desde === ate)', () => {
    const hoje = new Date('2026-08-29T15:00:00');
    expect(diasTranscorridos(hoje, hoje)).toBe(1);
  });

  it('conta os dias corridos já transcorridos numa semana parcial', () => {
    const domingo = new Date('2026-08-23T00:00:00'); // início da semana
    const quarta = new Date('2026-08-26T18:00:00'); // "hoje" no meio da semana
    expect(diasTranscorridos(domingo, quarta)).toBe(4); // dom, seg, ter, qua
  });

  it('nunca retorna menos que 1, mesmo com datas invertidas por engano', () => {
    const a = new Date('2026-08-29T00:00:00');
    const b = new Date('2026-08-20T00:00:00');
    expect(diasTranscorridos(a, b)).toBeGreaterThanOrEqual(1);
  });
});
