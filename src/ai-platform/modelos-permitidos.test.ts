import { describe, expect, it } from 'vitest';
import { modeloValido, MODELOS_PERMITIDOS, MODELO_PADRAO } from './modelos-permitidos';

describe('modeloValido', () => {
  it('aceita qualquer string pro MOCK (nunca restringe o determinístico)', () => {
    expect(modeloValido('MOCK', 'qualquer-coisa')).toBe(true);
  });

  it('aceita só modelos da lista permitida por provider real', () => {
    for (const modelo of MODELOS_PERMITIDOS.ANTHROPIC) {
      expect(modeloValido('ANTHROPIC', modelo)).toBe(true);
    }
    expect(modeloValido('ANTHROPIC', 'modelo-fabricado-pelo-atacante')).toBe(false);
    expect(modeloValido('OPENAI', 'gpt-inexistente')).toBe(false);
    expect(modeloValido('GEMINI', 'gemini-inexistente')).toBe(false);
  });

  it('modelo de um provider não é aceito pra outro (evita cross-provider mismatch)', () => {
    expect(modeloValido('OPENAI', MODELOS_PERMITIDOS.ANTHROPIC[0])).toBe(false);
  });

  it('todo default está dentro da própria lista de permitidos', () => {
    expect(MODELOS_PERMITIDOS.ANTHROPIC).toContain(MODELO_PADRAO.ANTHROPIC);
    expect(MODELOS_PERMITIDOS.OPENAI).toContain(MODELO_PADRAO.OPENAI);
    expect(MODELOS_PERMITIDOS.GEMINI).toContain(MODELO_PADRAO.GEMINI);
  });
});
