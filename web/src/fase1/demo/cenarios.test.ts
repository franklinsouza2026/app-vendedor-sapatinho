import { describe, expect, it } from 'vitest';
import { CENARIOS, montarCenario } from './cenarios';
import { derivarAlvos, minhaPosicao } from '../dominio/alvos';
import { priorizarAlvos } from '../dominio/proximoAlvo';
import { pct } from '../formato';

/**
 * Os cenários são o roteiro de homologação: cada um precisa demonstrar a
 * situação que promete. Se um ajuste no mock quebrar a história, falha aqui.
 */
function proximoAlvo(id: string) {
  return priorizarAlvos(derivarAlvos(montarCenario(id)))[0];
}

describe('cenários de demonstração da Fase 1', () => {
  it('todos montam sem erro e são determinísticos', () => {
    for (const c of CENARIOS) {
      expect(montarCenario(c.id)).toEqual(montarCenario(c.id));
    }
  });

  it('B: 76% da meta, faltam R$ 486 ≈ 2 vendas, #2 na loja ↑1 a R$ 320 do #1, #7 geral ↑2', () => {
    const d = montarCenario('B');
    expect(pct((d.hoje.realizado.faturamento / d.hoje.meta!) * 100)).toBe('76%');
    expect(d.hoje.meta! - d.hoje.realizado.faturamento).toBe(486);
    const loja = minhaPosicao(d, 'loja', 'VENDAS')!;
    expect(loja).toMatchObject({ posicao: 2, variacao: 1, distanciaAcima: 320 });
    expect(minhaPosicao(d, 'geral', 'VENDAS')).toMatchObject({ posicao: 7, variacao: 2 });
    expect(proximoAlvo('B')).toMatchObject({ tipo: 'META_DIA', falta: 'R$ 486', esforcoVendas: 2 });
  });

  it('cada cenário de jornada destaca o Próximo Alvo que promete', () => {
    expect(proximoAlvo('A')).toMatchObject({ tipo: 'MISSAO', esforcoVendas: 1 });
    expect(proximoAlvo('C')).toMatchObject({ tipo: 'RANKING', falta: 'R$ 90', esforcoVendas: 1 });
    expect(proximoAlvo('D')).toMatchObject({ tipo: 'META_DIA', falta: 'R$ 20' });
    expect(proximoAlvo('F')).toMatchObject({ tipo: 'RECORDE', falta: 'R$ 860' });
    expect(proximoAlvo('G')).toMatchObject({ tipo: 'MISSAO', falta: '1 venda' });
    expect(proximoAlvo('L')).toMatchObject({ tipo: 'NIVEL', falta: '80 XP' });
  });

  it('K: vendedora #1 da loja e loja 24 pontos atrás da líder', () => {
    const d = montarCenario('K');
    expect(minhaPosicao(d, 'loja', 'VENDAS')!.posicao).toBe(1);
    const lojas = [...d.rankings.lojas].sort((a, b) => b.pontos - a.pontos);
    expect(lojas[1].lojaId).toBe('caruaru');
    expect(lojas[0].pontos - lojas[1].pontos).toBe(24);
  });

  it('L: vendedora nova fica fora do ranking e estima pelo ticket da loja', () => {
    const d = montarCenario('L');
    expect(minhaPosicao(d, 'loja', 'VENDAS')).toBeNull();
    expect(d.referencia.origem).toBe('LOJA');
  });

  it('N: sem referência, nenhum valor em R$ vira estimativa de vendas', () => {
    const d = montarCenario('N');
    expect(d.referencia.ticketMedio).toBeNull();
    const emReais = derivarAlvos(d).filter((a) => a.falta.startsWith('R$'));
    expect(emReais.length).toBeGreaterThan(0);
    expect(emReais.every((a) => a.esforcoVendas === null)).toBe(true);
  });

  it('faturamento da vendedora no ranking é sempre o mesmo do mês', () => {
    for (const c of CENARIOS) {
      const d = montarCenario(c.id);
      const minha = d.rankings.loja.VENDAS.find((l) => l.pessoaId === 'ana');
      if (minha) expect(minha.valor).toBe(d.mes.realizado.faturamento);
    }
  });
});
