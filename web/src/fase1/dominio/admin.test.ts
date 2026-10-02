import { describe, expect, it } from 'vitest';
import { estadoInicial } from '../demo/estado';
import { calcularPendencias, calcularProntidao, consistenciaMetasLoja, diasValidosDoMes, diasValidosRestantes, opcoesMetaDiaria, regrasEditaveis, statusAoPublicar, validarCampanha, validarMissao } from './admin';

const AGORA = '2026-10-22T15:20:00';

describe('calendário e meta diária', () => {
  it('outubro/2026 sem domingos tem 27 dias válidos; restam 8 depois de 22/10', () => {
    const e = estadoInicial();
    expect(diasValidosDoMes('2026-10', e, 'caruaru')).toHaveLength(27);
    expect(diasValidosRestantes(AGORA, e, 'caruaru')).toBe(8);
  });

  it('abrir aos domingos aumenta os dias válidos', () => {
    const e = estadoInicial();
    e.calendario.abreDomingo = true;
    expect(diasValidosDoMes('2026-10', e, 'caruaru')).toHaveLength(31);
  });

  it('três regras de meta diária, calculadas lado a lado', () => {
    const e = estadoInicial();
    const op = opcoesMetaDiaria(e, 'ana', 'caruaru', AGORA, 21686);
    expect(op.manual).toBe(2000);
    expect(op.uniforme).toBe(Math.round(30000 / 27));
    expect(op.diasValidos).toBe(Math.round((30000 - 21686) / 9));
  });
});

describe('metas: consistência loja × individual', () => {
  it('estado inicial é consistente nas três lojas', () => {
    const e = estadoInicial();
    for (const l of e.lojas) expect(consistenciaMetasLoja(e, l.id).diferenca).toBe(0);
  });
  it('mudar a meta individual gera diferença', () => {
    const e = estadoInicial();
    e.metas.individuais.ana.mensal = 32000;
    expect(consistenciaMetasLoja(e, 'caruaru').diferenca).toBe(2000);
  });
});

describe('pendências e prontidão', () => {
  it('estado inicial: vendedora sem meta, vínculos, dado atrasado, campanha sem prêmio e Loja × Loja sem regra', () => {
    const ids = calcularPendencias(estadoInicial(), AGORA).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['sem-meta', 'vinculos', 'sync-difusora', 'camp-premio-novembro-black', 'lxl']));
  });

  it('resolver no Admin faz a pendência sumir', () => {
    const e = estadoInicial();
    e.metas.individuais.sofia.mensal = 0;
    e.lojas.find((l) => l.id === 'difusora')!.ultimaSync = '2026-10-22T15:10:00';
    const ids = calcularPendencias(e, AGORA).map((p) => p.id);
    expect(ids).not.toContain('sync-difusora');
  });

  it('prontidão aponta bloqueio enquanto houver pendência bloqueante', () => {
    const itens = calcularProntidao(estadoInicial(), AGORA);
    expect(itens.find((i) => i.area === 'Dados')!.situacao).toBe('BLOQUEIO');
    expect(itens.find((i) => i.area === 'Gamificação')!.situacao).toBe('OK');
  });
});

describe('validação antes de publicar e ciclo de vida', () => {
  it('campanha sem prêmio e sem regras não publica — e diz exatamente o porquê', () => {
    const e = estadoInicial();
    const c = e.campanhas.find((x) => x.id === 'novembro-black')!;
    const pendentes = validarCampanha(c, e).filter((v) => !v.ok);
    expect(pendentes.map((p) => p.rotulo)).toEqual(expect.arrayContaining(['Premiação', 'Regras']));
    expect(pendentes.find((p) => p.rotulo === 'Premiação')!.problema).toContain('Meta batida');
  });

  it('missão de produto sem produto não publica', () => {
    const e = estadoInicial();
    const m = { ...e.missoes.find((x) => x.id === 'm-produto')!, produtos: [] };
    expect(validarMissao(m, e).find((v) => v.rotulo === 'Produtos')!.ok).toBe(false);
  });

  it('regra crítica só é editável em rascunho/programada; publicar no futuro programa', () => {
    expect(regrasEditaveis('RASCUNHO')).toBe(true);
    expect(regrasEditaveis('ATIVA')).toBe(false);
    expect(statusAoPublicar('2026-11-01T00:00:00', AGORA)).toBe('PROGRAMADA');
    expect(statusAoPublicar('2026-10-22T09:00:00', AGORA)).toBe('ATIVA');
  });
});
