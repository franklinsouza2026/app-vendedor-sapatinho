import { describe, expect, it } from 'vitest';
import { falta, marcosAtingidos, ordenarRanking, pecasEstimadas, percentual, projecaoMes, proximoMarco, vendasEstimadas, vendasPorDia } from './estimativas';
import { calcularNivel } from '../demo/niveisDemo';
import { priorizarAlvos, vocePerto } from './proximoAlvo';
import type { Alvo } from './tipos';
import { pct } from '../formato';

describe('estimativas da Fase 1 (regra provisória)', () => {
  it('exemplo do comando: R$ 6.800 no ticket R$ 250 e PA 1,8 em 8 dias → ≈28 vendas, ≈50 pares, ≈4/dia', () => {
    const v = vendasEstimadas(6800, 250);
    expect(v).toBe(28);
    expect(pecasEstimadas(v, 1.8)).toBe(50);
    expect(vendasPorDia(v, 8)).toBe(4);
  });

  it('regra da quantidade inteira: ⌈restante ÷ ticket⌉ — 1,95 vira 2; exato não sobe', () => {
    expect(vendasEstimadas(2000 - 1514, 249)).toBe(2); // 486 / 249 = 1,95
    expect(vendasEstimadas(498, 249)).toBe(2); // exato
    expect(vendasEstimadas(499, 249)).toBe(3);
    expect(vendasEstimadas(320, 249)).toBe(2);
  });

  it('meta mensal: 30.000 − 23.200 = 6.800; vendas, pares e por dia reagem ao ticket, PA e dias', () => {
    const f = falta(23200, 30000)!;
    expect(f).toBe(6800);
    expect(vendasEstimadas(f, 250)).toBe(28);
    expect(vendasEstimadas(f, 200)).toBe(34); // ticket menor → mais vendas
    expect(pecasEstimadas(28, 2)).toBe(56);
    expect(vendasPorDia(28, 7)).toBe(4);
    expect(vendasPorDia(28, 5)).toBe(6);
  });

  it('sem ticket, sem meta ou sem dias: nenhuma estimativa (não inventa precisão)', () => {
    expect(vendasEstimadas(486, null)).toBeNull();
    expect(vendasEstimadas(486, 0)).toBeNull();
    expect(percentual(100, null)).toBeNull();
    expect(falta(100, null)).toBeNull();
    expect(vendasPorDia(10, null)).toBeNull();
    expect(projecaoMes(1000, 2, 8)).toBeNull();
  });

  it('marcos da meta: 109% → faltam R$ 20 para 110%; 152% → nenhum marco pendente', () => {
    expect(proximoMarco(2180, 2000)).toEqual({ marco: 110, faltaReais: 20 });
    expect(proximoMarco(3040, 2000)).toBeNull();
    expect(marcosAtingidos(2460, 2000)).toEqual([100, 110, 120]);
  });

  it('percentual exibido nunca vira 100% sem a meta estar batida', () => {
    expect(pct(99.6)).toBe('99%');
    expect(pct(75.7)).toBe('76%');
    expect(pct(100)).toBe('100%');
  });

  it('ranking: posição, distância para quem está acima e variação', () => {
    const r = ordenarRanking([
      { pessoaId: 'a', valor: 100, posicaoAnterior: 3 },
      { pessoaId: 'b', valor: 150, posicaoAnterior: 1 },
      { pessoaId: 'c', valor: 120, posicaoAnterior: 2 },
    ]);
    expect(r.map((x) => [x.linha.pessoaId, x.posicao, x.distanciaAcima, x.variacao])).toEqual([
      ['b', 1, null, 0],
      ['c', 2, 30, 0],
      ['a', 3, 20, 0],
    ]);
  });
});

describe('níveis (espelho da curva v1 do backend)', () => {
  it('1.640 XP = Ouro, faltam 160 para Platina', () => {
    expect(calcularNivel(1640)).toMatchObject({ nome: 'Ouro', nivel: 3, faltaXp: 160 });
  });
  it('nível máximo não tem próximo', () => {
    expect(calcularNivel(9000)).toMatchObject({ nome: 'Elite', proximo: null, faltaXp: null });
  });
});

describe('Próximo Alvo (prioridade provisória)', () => {
  const alvo = (id: string, tipo: Alvo['tipo'], esforcoVendas: number | null): Alvo => ({ id, tipo, esforcoVendas, icone: '', falta: '', objetivo: '', rota: '/' });

  it('o mais perto vence; empate segue a ordem de tipo (meta do dia primeiro)', () => {
    const ordem = priorizarAlvos([alvo('r', 'RANKING', 2), alvo('m', 'META_DIA', 2), alvo('x', 'MISSAO', 1)]);
    expect(ordem.map((a) => a.id)).toEqual(['x', 'm', 'r']);
  });

  it('"Você está perto" não repete tipo nem o alvo principal', () => {
    const perto = vocePerto([alvo('m1', 'MISSAO', 1), alvo('m2', 'MISSAO', 2), alvo('r', 'RANKING', 2), alvo('n', 'NIVEL', null)]);
    expect(perto.map((a) => a.id)).toEqual(['r', 'n']);
  });
});
