import { describe, expect, it } from 'vitest';
import { diasRestantesNoPeriodo, ritmoNecessario, vendasNecessarias } from './calculo';

describe('vendasNecessarias', () => {
  it('arredonda pra cima (nunca promete menos vendas do que realmente faltam)', () => {
    expect(vendasNecessarias(150, 100)).toBe(2); // 1.5 -> 2
  });

  it('retorna null quando não há ticket médio (divisão por zero)', () => {
    expect(vendasNecessarias(150, 0)).toBeNull();
  });

  it('retorna 0 quando já não falta nada', () => {
    expect(vendasNecessarias(0, 100)).toBe(0);
  });
});

describe('diasRestantesNoPeriodo', () => {
  it('semana: domingo tem 7 dias restantes (hoje incluso)', () => {
    const domingo = new Date('2026-08-30T10:00:00'); // domingo
    expect(diasRestantesNoPeriodo('SEMANA', domingo)).toBe(7);
  });

  it('semana: sábado tem 1 dia restante', () => {
    const sabado = new Date('2026-08-29T10:00:00'); // sábado
    expect(diasRestantesNoPeriodo('SEMANA', sabado)).toBe(1);
  });

  it('mês: último dia tem 1 dia restante', () => {
    const ultimoDia = new Date('2026-08-31T10:00:00');
    expect(diasRestantesNoPeriodo('MES', ultimoDia)).toBe(1);
  });
});

describe('ritmoNecessario', () => {
  it('divide o que falta pelos dias restantes', () => {
    const sexta = new Date('2026-08-28T10:00:00'); // sexta -> 2 dias restantes na semana
    expect(ritmoNecessario(200, 'SEMANA', sexta)).toBe(100);
  });
});
