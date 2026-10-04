// Landing por papel (Fatia 9.7, P1). Antes, todo mundo caía em "/" e o ADMIN
// via a Home de vendedor — com meta, missão e ranking que não são dele.
import { describe, expect, it } from 'vitest';
import { rotaInicialPara } from './rotaInicial';

describe('rotaInicialPara', () => {
  it('Fase 1: ADMIN vai para a central do Admin, nunca para a Home de vendedor', () => {
    expect(rotaInicialPara('ADMIN')).toBe('/admin');
  });

  it('Fase 1: VENDEDOR vai para o Início; papéis fora do piloto vão para /sem-acesso', () => {
    expect(rotaInicialPara('VENDEDOR')).toBe('/inicio');
    expect(rotaInicialPara('GERENTE')).toBe('/sem-acesso');
    expect(rotaInicialPara('PLATFORM_ADMIN')).toBe('/sem-acesso');
  });

  it('nunca devolve rota vazia (evita Navigate pra lugar nenhum)', () => {
    for (const papel of ['ADMIN', 'GERENTE', 'VENDEDOR'] as const) {
      expect(rotaInicialPara(papel)).toMatch(/^\//);
    }
  });
});
