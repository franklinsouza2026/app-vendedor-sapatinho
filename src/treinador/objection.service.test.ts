import { describe, expect, it } from 'vitest';
import { listarObjecoesComuns } from './objection.service';

describe('listarObjecoesComuns', () => {
  it('retorna uma lista não vazia com code e label únicos', () => {
    const objecoes = listarObjecoesComuns();
    expect(objecoes.length).toBeGreaterThan(0);

    const codes = objecoes.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length); // sem code duplicado
    for (const o of objecoes) {
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});
