// Funções puras de normalização e cálculo do Score Geral (seção 18 da fonte
// de verdade). Sem I/O — 100% determinístico e testável sem banco.
//
// v1 (regraVersao referenciada externamente): decisões explícitas tomadas
// aqui, documentadas em 05-Decisoes-e-Tradeoffs.md do vault, versionadas
// pra nunca reinterpretar retroativamente uma temporada já fechada:
//
// - normalizarMeta: 0%→0, 100%→80, 120%+→100, interpolação linear entre marcos.
// - normalizarDeltaBaseline: usado por evolução/PA/ticket. -30% ou pior→0,
//   0%→50 (estabilidade), +30% ou melhor→100, interpolação linear, cap [0,100].
// - "evolução pessoal" (peso 20%) usa baseline pessoal de FATURAMENTO_DIA
//   (distinto de PA/ticket, que têm peso e baseline próprios).
// - consistência: % de dias fechados, dentro da janela, com meta diária >=100%.

import { PesosScore } from './regras.service';

export function normalizarMeta(percentualMeta: number): number {
  if (percentualMeta <= 0) return 0;
  if (percentualMeta <= 100) return (percentualMeta / 100) * 80;
  if (percentualMeta <= 120) return 80 + ((percentualMeta - 100) / 20) * 20;
  return 100;
}

export function normalizarDeltaBaseline(deltaPercentual: number): number {
  const clamped = Math.max(-30, Math.min(30, deltaPercentual));
  return 50 + (clamped / 30) * 50;
}

export function normalizarConsistencia(diasComMetaBatida: number, diasComDadoDisponivel: number): number | null {
  if (diasComDadoDisponivel <= 0) return null;
  const pct = (diasComMetaBatida / diasComDadoDisponivel) * 100;
  return Math.max(0, Math.min(100, pct));
}

export interface ComponentesScore {
  metaPercentual: number; // sempre disponível (vem do sync do dia)
  evolucaoDeltaPct: number | null; // null = baseline em formação
  paDeltaPct: number | null;
  ticketDeltaPct: number | null;
  consistenciaPct: number | null;
}

export interface ResultadoScore {
  scoreGeral: number; // 0-1000
  provisorio: boolean;
  componentesNormalizados: {
    meta: number;
    evolucao: number | null;
    pa: number | null;
    ticket: number | null;
    consistencia: number | null;
  };
}

/**
 * Calcula o Score Geral (0-1000). Componentes sem amostra suficiente (null)
 * são excluídos e o peso é redistribuído proporcionalmente entre os
 * componentes disponíveis — nunca derruba o score por falta de dado
 * (ver seção 18, "condições de justiça").
 */
export function calcularScoreGeral(comp: ComponentesScore, pesos: PesosScore): ResultadoScore {
  const metaNorm = normalizarMeta(comp.metaPercentual);
  const evolucaoNorm = comp.evolucaoDeltaPct === null ? null : normalizarDeltaBaseline(comp.evolucaoDeltaPct);
  const paNorm = comp.paDeltaPct === null ? null : normalizarDeltaBaseline(comp.paDeltaPct);
  const ticketNorm = comp.ticketDeltaPct === null ? null : normalizarDeltaBaseline(comp.ticketDeltaPct);
  const consistenciaNorm = comp.consistenciaPct;

  const disponiveis: { peso: number; valor: number }[] = [{ peso: pesos.meta, valor: metaNorm }];
  if (evolucaoNorm !== null) disponiveis.push({ peso: pesos.evolucao, valor: evolucaoNorm });
  if (paNorm !== null) disponiveis.push({ peso: pesos.pa, valor: paNorm });
  if (ticketNorm !== null) disponiveis.push({ peso: pesos.ticket, valor: ticketNorm });
  if (consistenciaNorm !== null) disponiveis.push({ peso: pesos.consistencia, valor: consistenciaNorm });

  const somaPesos = disponiveis.reduce((acc, d) => acc + d.peso, 0);
  const scoreBase = disponiveis.reduce((acc, d) => acc + d.valor * (d.peso / somaPesos), 0);

  const provisorio = evolucaoNorm === null || paNorm === null || ticketNorm === null || consistenciaNorm === null;

  return {
    scoreGeral: Math.round(scoreBase * 10),
    provisorio,
    componentesNormalizados: {
      meta: metaNorm,
      evolucao: evolucaoNorm,
      pa: paNorm,
      ticket: ticketNorm,
      consistencia: consistenciaNorm,
    },
  };
}
