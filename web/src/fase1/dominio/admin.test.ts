import { describe, expect, it } from 'vitest';
import { estadoAdminFixture } from '../admin/__testes__/estadoFixture';
import { calcularPendencias, calcularProntidao, consistenciaMetasLoja, regrasEditaveis } from './admin';

describe('regras de exibição do Admin (estado real do servidor)', () => {
  it('estado completo não gera pendência bloqueante', () => {
    const e = estadoAdminFixture();
    expect(calcularPendencias(e).filter((p) => p.bloqueiaPiloto)).toEqual([]);
  });

  it('vendedor sem meta ou sem dias de trabalho bloqueia o piloto (D6/D10)', () => {
    const e = estadoAdminFixture();
    e.metas.individuais.v2 = { mensal: null, diasPrevistos: null, diaria: null };
    const ids = calcularPendencias(e).map((p) => p.id);
    expect(ids).toContain('sem-meta');
    expect(ids).toContain('sem-dias');
    expect(calcularProntidao(e).find((i) => i.area === 'Metas')?.situacao).toBe('BLOQUEIO');
  });

  it('loja nunca sincronizada aponta para Integrações e bloqueia', () => {
    const e = estadoAdminFixture({ lojas: [{ id: 'l1', nome: 'Caruaru', codigo: '01', status: 'ATIVA', ultimaSync: null, metaMes: null }] });
    const p = calcularPendencias(e).find((x) => x.id === 'sync-l1');
    expect(p?.rota).toBe('/admin/integracoes');
    expect(p?.bloqueiaPiloto).toBe(true);
  });

  it('sync atrasado (> 90 min) bloqueia', () => {
    const e = estadoAdminFixture();
    e.lojas[0].ultimaSync = '2026-10-04T12:00:00.000Z';
    expect(calcularPendencias(e).find((x) => x.id === 'sync-l1')?.texto).toMatch(/desatualizado/);
  });

  it('consistência da meta da loja compara com a soma individual', () => {
    const e = estadoAdminFixture();
    expect(consistenciaMetasLoja(e, 'l1').diferenca).toBe(0);
    e.lojas[0].metaMes = 50000;
    expect(consistenciaMetasLoja(e, 'l1').diferenca).toBe(10000);
  });

  it('indicador sem fonte ligado ao vendedor bloqueia a prontidão', () => {
    const e = estadoAdminFixture();
    e.indicadores.CONVERSAO = { ativo: true, fonte: 'SEM_FONTE', nota: '' };
    expect(calcularProntidao(e).find((i) => i.area === 'Indicadores')?.situacao).toBe('BLOQUEIO');
  });

  it('regras críticas só são editáveis antes do início', () => {
    expect(regrasEditaveis('RASCUNHO')).toBe(true);
    expect(regrasEditaveis('PROGRAMADA')).toBe(true);
    expect(regrasEditaveis('ATIVA')).toBe(false);
    expect(regrasEditaveis('ENCERRADA')).toBe(false);
  });
});
