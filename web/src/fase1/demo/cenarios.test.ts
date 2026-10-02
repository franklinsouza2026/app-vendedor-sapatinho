import { describe, expect, it } from 'vitest';
import { CENARIOS, montarCenario } from './cenarios';
import { estadoInicial } from './estado';
import { derivarAlvos, minhaPosicao } from '../dominio/alvos';
import { priorizarAlvos, vocePerto } from '../dominio/proximoAlvo';
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

  it('existem os cenários A–T exigidos e os estados especiais', () => {
    const ids = CENARIOS.map((c) => c.id);
    for (const letra of 'ABCDEFGHIJKLMNOPQRST') expect(ids).toContain(letra);
    expect(CENARIOS.filter((c) => c.grupo === 'estado').length).toBeGreaterThanOrEqual(6);
  });

  it('B: 76% da meta, faltam R$ 486 ≈ 2 vendas, #2 na loja ↑1 a R$ 320 do #1, #7 geral ↑2', () => {
    const d = montarCenario('B');
    expect(pct((d.hoje.realizado.faturamento / d.hoje.meta!) * 100)).toBe('76%');
    expect(d.hoje.meta! - d.hoje.realizado.faturamento).toBe(486);
    expect(minhaPosicao(d, 'loja', 'VENDAS')).toMatchObject({ posicao: 2, variacao: 1, distanciaAcima: 320 });
    expect(minhaPosicao(d, 'geral', 'VENDAS')).toMatchObject({ posicao: 7, variacao: 2 });
    expect(proximoAlvo('B')).toMatchObject({ tipo: 'META_DIA', falta: 'R$ 486', esforcoVendas: 2 });
  });

  it('B: mês R$ 23.200 de R$ 30.000 com 8 dias de trabalho restantes (calendário do Admin)', () => {
    const d = montarCenario('B');
    expect(d.mes.meta).toBe(30000);
    expect(d.mes.diasTrabalhoRestantes).toBe(8);
  });

  it('cada cenário de jornada destaca o Próximo Alvo que promete', () => {
    expect(proximoAlvo('A')).toMatchObject({ tipo: 'MISSAO', esforcoVendas: 1 });
    expect(proximoAlvo('C')).toMatchObject({ tipo: 'RANKING', falta: 'R$ 90', esforcoVendas: 1 });
    expect(proximoAlvo('D')).toMatchObject({ tipo: 'META_DIA', falta: 'R$ 20' });
    expect(proximoAlvo('H')).toMatchObject({ tipo: 'RECORDE', falta: 'R$ 860' });
    expect(proximoAlvo('I')).toMatchObject({ tipo: 'MISSAO', falta: '1 venda' });
    expect(proximoAlvo('O')).toMatchObject({ tipo: 'NIVEL', falta: '80 XP' });
  });

  it('L: recorde do melhor mês a R$ 860 aparece em "Você está perto"', () => {
    expect(vocePerto(derivarAlvos(montarCenario('L')), 2)).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'RECORDE', falta: 'R$ 860' })]));
  });

  it('E/F/G: 110%, 120% e 150% da meta do dia', () => {
    const p = (id: string) => (montarCenario(id).hoje.realizado.faturamento / montarCenario(id).hoje.meta!) * 100;
    expect(p('E')).toBeGreaterThanOrEqual(110);
    expect(p('F')).toBeGreaterThanOrEqual(120);
    expect(p('G')).toBeGreaterThanOrEqual(150);
  });

  it('N: vendedora #1 da loja e loja 31 pontos atrás da líder', () => {
    const d = montarCenario('N');
    expect(minhaPosicao(d, 'loja', 'VENDAS')!.posicao).toBe(1);
    const lojas = [...d.rankings.lojas].sort((a, b) => b.pontos - a.pontos);
    expect(lojas[1].lojaId).toBe('caruaru');
    expect(lojas[0].pontos - lojas[1].pontos).toBe(31);
  });

  it('O: vendedora nova fica fora do ranking e estima pelo ticket da loja', () => {
    const d = montarCenario('O');
    expect(minhaPosicao(d, 'loja', 'VENDAS')).toBeNull();
    expect(d.elegibilidade.elegivel).toBe(false);
    expect(d.referencia.origem).toBe('LOJA');
  });

  it('Q: sem referência, nenhum valor em R$ vira estimativa de vendas', () => {
    const d = montarCenario('Q');
    expect(d.referencia.ticketMedio).toBeNull();
    const emReais = derivarAlvos(d).filter((a) => a.falta.startsWith('R$'));
    expect(emReais.length).toBeGreaterThan(0);
    expect(emReais.every((a) => a.esforcoVendas === null)).toBe(true);
  });

  it('S/T: campanha ativa e campanha encerrada com resultado', () => {
    expect(montarCenario('S').campanhas[0]).toMatchObject({ nome: 'Outubro Campeão', status: 'ATIVA' });
    const t = montarCenario('T');
    expect(t.campanhas.some((c) => c.status === 'ATIVA')).toBe(false);
    expect(t.campanhas[0]).toMatchObject({ nome: 'Outubro Campeão', status: 'ENCERRADA', meusGanhos: { xp: 200, moedas: 80 } });
  });

  it('faturamento da vendedora no ranking é sempre o mesmo do mês', () => {
    for (const c of CENARIOS) {
      const d = montarCenario(c.id);
      const minha = d.rankings.loja.VENDAS.find((l) => l.pessoaId === 'ana');
      if (minha) expect(minha.valor).toBe(d.mes.realizado.faturamento);
    }
  });
});

describe('Admin → vendedora (o estado configura, o cenário só descreve a situação)', () => {
  it('meta alterada pelo Admin chega à vendedora com falta e estimativa recalculadas', () => {
    const e = estadoInicial();
    e.metas.individuais.ana.mensal = 32000;
    const d = montarCenario('B', e);
    expect(d.mes.meta).toBe(32000);
    expect(d.mes.meta! - d.mes.realizado.faturamento).toBe(8800);
  });

  it('missão publicada aparece; cancelada some', () => {
    const e = estadoInicial();
    e.missoes.find((m) => m.id === 'm-tenis')!.status = 'ATIVA';
    e.missoes.find((m) => m.id === 'm-tenis')!.inicio = '2026-10-22T09:00:00';
    e.missoes.find((m) => m.id === 'm-produto')!.status = 'CANCELADA';
    const d = montarCenario('B', e);
    expect(d.missoes.map((m) => m.id)).toContain('m-tenis');
    expect(d.missoes.map((m) => m.id)).not.toContain('m-produto');
  });

  it('feriado hoje fecha a loja; feriado no fim do mês reduz os dias restantes', () => {
    const e = estadoInicial();
    e.calendario.feriados.push({ id: 'x', data: '2026-10-28', nome: 'Teste', lojas: 'TODAS' });
    expect(montarCenario('B', e).mes.diasTrabalhoRestantes).toBe(7);
    e.calendario.feriados.push({ id: 'y', data: '2026-10-22', nome: 'Hoje', lojas: ['caruaru'] });
    const d = montarCenario('B', e);
    expect(d.status.lojaFechada).toBe(true);
    expect(d.hoje.meta).toBeNull();
  });

  it('indicador oculto pelo Admin some da vendedora (sem ticket, sem estimativa)', () => {
    const e = estadoInicial();
    e.indicadores.TICKET.ativo = false;
    const d = montarCenario('B', e);
    expect(d.indicadores.TICKET).toBe(false);
    expect(d.referencia.ticketMedio).toBeNull();
    expect(d.metricasRanking).not.toContain('TICKET');
  });

  it('reconhecimento do Admin chega à vendedora e ao feed', () => {
    const e = estadoInicial();
    e.reconhecimentos.unshift({ id: 'novo', vendedorId: 'ana', motivo: 'INICIATIVA', titulo: 'Vitrine nova', mensagem: 'Montou a vitrine de verão sozinha.', quando: '2026-10-22T15:20:00', autor: 'Admin' });
    const d = montarCenario('B', e);
    expect(d.reconhecimentos[0].titulo).toBe('Vitrine nova');
    expect(d.feed[0].texto).toContain('Vitrine nova');
  });

  it('vendedora tirada do ranking por exceção não aparece nos rankings', () => {
    const e = estadoInicial();
    Object.assign(e.vendedores.find((v) => v.id === 'ana')!, { elegivel: false, motivoInelegivel: 'EXCECAO' });
    const d = montarCenario('B', e);
    expect(d.elegibilidade.elegivel).toBe(false);
    expect(d.rankings.loja.VENDAS.some((l) => l.pessoaId === 'ana')).toBe(false);
  });

  it('regra de meta diária "uniforme" muda a meta do dia', () => {
    const e = estadoInicial();
    e.metas.distribuicao = 'UNIFORME';
    expect(montarCenario('B', e).hoje.meta).toBe(Math.round(30000 / 27));
  });
});
