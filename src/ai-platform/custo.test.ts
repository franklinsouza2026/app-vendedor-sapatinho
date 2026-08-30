import { describe, expect, it } from 'vitest';
import { calcularCustoEstimadoUSD } from './custo';

describe('calcularCustoEstimadoUSD', () => {
  it('calcula custo pra um modelo conhecido de cada provider', () => {
    expect(calcularCustoEstimadoUSD('anthropic', 'claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(2.0, 5);
    expect(calcularCustoEstimadoUSD('openai', 'gpt-5.1-mini', 0, 1_000_000)).toBeCloseTo(4.0, 5);
    expect(calcularCustoEstimadoUSD('gemini', 'gemini-3-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.5, 5);
  });

  it('modelo desconhecido usa o preço padrão conservador, nunca lança erro', () => {
    expect(() => calcularCustoEstimadoUSD('anthropic', 'modelo-inexistente', 1000, 1000)).not.toThrow();
    expect(calcularCustoEstimadoUSD('anthropic', 'modelo-inexistente', 1_000_000, 0)).toBeCloseTo(5.0, 5);
  });

  it('provider desconhecido também usa o preço padrão, nunca lança erro', () => {
    expect(calcularCustoEstimadoUSD('provider-novo', 'modelo-x', 1_000_000, 0)).toBeCloseTo(5.0, 5);
  });

  it('zero tokens gera custo zero', () => {
    expect(calcularCustoEstimadoUSD('anthropic', 'claude-opus-5', 0, 0)).toBe(0);
  });
});
