import { describe, expect, it } from 'vitest';
import { diaDaSemana, diaLocal, diasEntre, inicioDaSemana, somarDias } from './dia';
import { calcularFrequencia, calcularMaiorStreak, calcularStreakAtual } from './regras';
import { PeriodoInvalidoError, resolverPeriodo } from './painel.service';

const SP = 'America/Sao_Paulo';

describe('dia local no fuso da empresa (virada do dia)', () => {
  it('23:30 em São Paulo continua sendo o MESMO dia, mesmo já sendo o dia seguinte em UTC', () => {
    expect(diaLocal(new Date('2026-10-22T02:30:00Z'), SP)).toBe('2026-10-21'); // 21/10 23:30 local
    expect(diaLocal(new Date('2026-10-22T03:10:00Z'), SP)).toBe('2026-10-22'); // 22/10 00:10 local
  });

  it('00:10 local não volta para o dia anterior', () => {
    expect(diaLocal(new Date('2026-10-22T03:00:00Z'), SP)).toBe('2026-10-22');
    expect(diaLocal(new Date('2026-10-22T02:59:59Z'), SP)).toBe('2026-10-21');
  });

  it('semana comercial começa na segunda', () => {
    expect(diaDaSemana('2026-10-21')).toBe(3); // quarta
    expect(inicioDaSemana('2026-10-21')).toBe('2026-10-19');
    expect(inicioDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo pertence à semana que começou na segunda
    expect(inicioDaSemana('2026-10-19')).toBe('2026-10-19');
  });

  it('aritmética de dias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasEntre('2026-10-19', '2026-10-21')).toBe(3);
  });
});

describe('frequência "X de Y dias" (dias válidos JÁ decorridos)', () => {
  const quarta = '2026-10-21';
  const semana = { inicio: '2026-10-19', fim: quarta, hoje: quarta, elegivelDesde: '2026-01-01' };

  it('quarta-feira: seg+ter+qua = 3 de 3 (100%), nunca 3 de 7', () => {
    expect(calcularFrequencia({ ...semana, diasComAcesso: new Set(['2026-10-19', '2026-10-20', '2026-10-21']) })).toEqual({ diasComAcesso: 3, diasValidos: 3, percentual: 100 });
  });

  it('seg+qua = 2 de 3 (67%)', () => {
    expect(calcularFrequencia({ ...semana, diasComAcesso: new Set(['2026-10-19', '2026-10-21']) })).toEqual({ diasComAcesso: 2, diasValidos: 3, percentual: 67 });
  });

  it('só terça = 1 de 3 (33%)', () => {
    expect(calcularFrequencia({ ...semana, diasComAcesso: new Set(['2026-10-20']) })).toEqual({ diasComAcesso: 1, diasValidos: 3, percentual: 33 });
  });

  it('admitido na terça: denominador começa na admissão (2 de 2)', () => {
    expect(calcularFrequencia({ ...semana, elegivelDesde: '2026-10-20', diasComAcesso: new Set(['2026-10-20', '2026-10-21']) })).toEqual({ diasComAcesso: 2, diasValidos: 2, percentual: 100 });
  });

  it('dias futuros do período não entram no denominador', () => {
    expect(calcularFrequencia({ inicio: '2026-10-19', fim: '2026-10-25', hoje: quarta, elegivelDesde: '2026-01-01', diasComAcesso: new Set(['2026-10-19']) }).diasValidos).toBe(3);
  });

  it('com escala no futuro: dia não válido sai do denominador', () => {
    const semTerca = (d: string) => d !== '2026-10-20';
    expect(calcularFrequencia({ ...semana, diasComAcesso: new Set(['2026-10-19', '2026-10-21']), ehDiaValido: semTerca })).toEqual({ diasComAcesso: 2, diasValidos: 2, percentual: 100 });
  });
});

describe('sequência (streak) de acesso', () => {
  it('conta dias consecutivos terminando hoje', () => {
    expect(calcularStreakAtual(new Set(['2026-10-19', '2026-10-20', '2026-10-21']), '2026-10-21')).toBe(3);
  });

  it('sem acesso hoje (ainda), a sequência de ontem continua viva', () => {
    expect(calcularStreakAtual(new Set(['2026-10-19', '2026-10-20']), '2026-10-21')).toBe(2);
  });

  it('um dia sem acesso quebra a sequência', () => {
    expect(calcularStreakAtual(new Set(['2026-10-17', '2026-10-18', '2026-10-20', '2026-10-21']), '2026-10-21')).toBe(2);
    expect(calcularStreakAtual(new Set(['2026-10-18']), '2026-10-21')).toBe(0);
  });

  it('maior sequência histórica', () => {
    expect(calcularMaiorStreak(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11']))).toBe(3);
  });
});

describe('períodos do painel', () => {
  const hoje = '2026-10-21';
  it('semana atual, últimos 7, semana passada, últimos 30', () => {
    expect(resolverPeriodo('SEMANA_ATUAL', hoje)).toEqual({ inicio: '2026-10-19', fim: hoje });
    expect(resolverPeriodo('ULTIMOS_7', hoje)).toEqual({ inicio: '2026-10-15', fim: hoje });
    expect(resolverPeriodo('SEMANA_PASSADA', hoje)).toEqual({ inicio: '2026-10-12', fim: '2026-10-18' });
    expect(resolverPeriodo('ULTIMOS_30', hoje)).toEqual({ inicio: '2026-09-22', fim: hoje });
  });

  it('personalizado: valida ordem e limite de 92 dias; nunca passa de hoje', () => {
    expect(resolverPeriodo('PERSONALIZADO', hoje, '2026-10-01', '2026-12-31')).toEqual({ inicio: '2026-10-01', fim: hoje });
    expect(() => resolverPeriodo('PERSONALIZADO', hoje, '2026-10-10', '2026-10-01')).toThrow(PeriodoInvalidoError);
    expect(() => resolverPeriodo('PERSONALIZADO', hoje, '2026-01-01', '2026-10-01')).toThrow(PeriodoInvalidoError);
  });
});
