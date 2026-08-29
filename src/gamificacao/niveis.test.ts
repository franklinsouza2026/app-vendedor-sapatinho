import { describe, expect, it } from 'vitest';
import { calcularNivel } from './niveis';

describe('calcularNivel', () => {
  it('começa em Bronze com 0 XP', () => {
    const n = calcularNivel(0);
    expect(n.nome).toBe('Bronze');
    expect(n.xpProximoNivel).toBe(300);
  });

  it('sobe pra Prata exatamente no limiar', () => {
    expect(calcularNivel(300).nome).toBe('Prata');
    expect(calcularNivel(299).nome).toBe('Bronze');
  });

  it('não passa do nível máximo (Elite) e xpProximoNivel vira null', () => {
    const n = calcularNivel(999999);
    expect(n.nome).toBe('Elite');
    expect(n.xpProximoNivel).toBeNull();
  });
});
