// Landing por papel (Fatia 9.7, P1). Antes, todo mundo caía em "/" e o ADMIN
// via a Home de vendedor — com meta, missão e ranking que não são dele.
import { describe, expect, it } from 'vitest';
import { rotaInicialPara } from './rotaInicial';

describe('rotaInicialPara', () => {
  it('ADMIN vai pro painel administrativo, nunca pra Home de vendedor', () => {
    expect(rotaInicialPara('ADMIN')).toBe('/admin/usuarios');
  });

  it('GERENTE e VENDEDOR vão pra "/", que já resolve a Home certa por papel', () => {
    expect(rotaInicialPara('GERENTE')).toBe('/');
    expect(rotaInicialPara('VENDEDOR')).toBe('/');
  });

  it('nunca devolve rota vazia (evita Navigate pra lugar nenhum)', () => {
    for (const papel of ['ADMIN', 'GERENTE', 'VENDEDOR'] as const) {
      expect(rotaInicialPara(papel)).toMatch(/^\//);
    }
  });
});
