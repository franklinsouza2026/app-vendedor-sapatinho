// Fronteiras temporais (Onda 8, §31): o "dia" e o "mês" da regra são sempre
// os do fuso da EMPRESA, nunca o do servidor (container em UTC).
import { describe, expect, it } from 'vitest';
import { diaLocal, diasNoMes, fimDoDiaLocal, instanteDoDia, listarDias, mesAnterior, mesLocal, primeiroDiaDoMes, somarDias, ultimoDiaDoMes, validarMes } from './dia';
import { calcularDiasRestantes, calcularMetaDiaria } from '../fase1/metas.service';

const SP = 'America/Sao_Paulo';

describe('dia local × UTC (America/Sao_Paulo, UTC−3)', () => {
  it('23:59 local ainda é hoje; 00:00 local já é amanhã — mesmo com o UTC no dia seguinte', () => {
    expect(diaLocal(new Date('2026-10-05T02:59:59.999Z'), SP)).toBe('2026-10-04');
    expect(diaLocal(new Date('2026-10-05T03:00:00.000Z'), SP)).toBe('2026-10-05');
  });

  it('instanteDoDia e fimDoDiaLocal delimitam exatamente o dia local', () => {
    expect(instanteDoDia('2026-10-04', SP).toISOString()).toBe('2026-10-04T03:00:00.000Z');
    const fim = fimDoDiaLocal('2026-10-04', SP);
    expect(diaLocal(fim, SP)).toBe('2026-10-04');
    expect(diaLocal(new Date(fim.getTime() + 1), SP)).toBe('2026-10-05');
  });

  it('virada de mês: 31/10 23:59 local é outubro; 01/11 00:00 local é novembro', () => {
    expect(mesLocal(new Date('2026-11-01T02:59:00.000Z'), SP)).toBe('2026-10');
    expect(mesLocal(new Date('2026-11-01T03:00:00.000Z'), SP)).toBe('2026-11');
  });

  it('virada de ano e mês anterior', () => {
    expect(mesLocal(new Date('2027-01-01T02:00:00.000Z'), SP)).toBe('2026-12');
    expect(mesAnterior('2027-01')).toBe('2026-12');
    expect(mesAnterior('2026-03')).toBe('2026-02');
  });

  it('primeiro/último dia e tamanho do mês (inclui fevereiro bissexto)', () => {
    expect(primeiroDiaDoMes('2026-10')).toBe('2026-10-01');
    expect(ultimoDiaDoMes('2026-10')).toBe('2026-10-31');
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2028-02')).toBe(29);
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
  });

  it('aritmética de dias atravessa mês e ano sem depender do fuso do processo', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
    expect(listarDias('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('mês inválido é recusado', () => {
    expect(validarMes('2026-13')).toBe(false);
    expect(validarMes('2026-1')).toBe(false);
    expect(validarMes('2026-10')).toBe(true);
  });
});

describe('meta do dia (D6) nas fronteiras', () => {
  it('meta mensal ÷ dias previstos, em centavos; sem meta ou sem dias não inventa meta', () => {
    expect(calcularMetaDiaria(30000, 24)).toBe(1250);
    expect(calcularMetaDiaria(10000, 3)).toBe(3333.33);
    expect(calcularMetaDiaria(null, 24)).toBeNull();
    expect(calcularMetaDiaria(30000, null)).toBeNull();
    expect(calcularMetaDiaria(30000, 0)).toBeNull();
  });

  it('dias restantes: último dia previsto → 0 depois de hoje; nunca negativo', () => {
    expect(calcularDiasRestantes(24, 23)).toBe(0);
    expect(calcularDiasRestantes(24, 30)).toBe(0);
    expect(calcularDiasRestantes(24, 0)).toBe(23);
  });
});
