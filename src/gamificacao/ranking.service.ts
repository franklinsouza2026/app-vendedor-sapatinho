// Rankings paralelos + Score Geral (seção 18 da fonte de verdade). Snapshot
// calculado e persistido — nunca ranking ao vivo por request (caro com
// centenas de vendedores, ver decisão equivalente no vault do projeto).
import { EscopoRanking, PeriodoMeta, TipoRanking } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, inicioDaSemana, inicioDoMes, metaDoPeriodo, realizadoNoPeriodo } from '../services/metas.service';
import { getRegraAtiva } from './regras.service';
import { getSaldoMoedas } from './ledger.service';
import { deltaPercentual, recomputarBaselines, JANELA_DIAS_BASELINE } from './baseline.service';
import { calcularScoreGeral, normalizarConsistencia } from './score';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:ranking');

function referenciaDoPeriodo(periodo: PeriodoMeta, hoje: Date): Date {
  return periodo === 'DIA' ? inicioDoDia(hoje) : periodo === 'SEMANA' ? inicioDaSemana(hoje) : inicioDoMes(hoje);
}

/** Dias corridos já transcorridos no período, do início até `ate` (inclusive). Mínimo 1. */
export function diasTranscorridos(desde: Date, ate: Date): number {
  const ms = inicioDoDia(ate).getTime() - inicioDoDia(desde).getTime();
  return Math.max(1, Math.round(ms / (24 * 3600 * 1000)) + 1);
}

async function consistenciaPct(vendedorId: string, ateDia: Date): Promise<number | null> {
  const inicio = new Date(ateDia);
  inicio.setDate(inicio.getDate() - JANELA_DIAS_BASELINE);
  const checagens = await prisma.streakChecagem.findMany({
    where: { vendedorId, tipo: 'META_DIARIA', data: { gte: inicio, lt: ateDia } },
  });
  if (checagens.length === 0) return null;
  const bateram = checagens.filter((c) => c.atingiu).length;
  return normalizarConsistencia(bateram, checagens.length);
}

interface DadosVendedor {
  vendedorId: string;
  lojaId: string;
  faturamento: number;
  percentualMeta: number;
  pa: number;
  ticketMedio: number;
  moedas: number;
  scoreGeral: number;
  scoreProvisorio: boolean;
  evolucaoNorm: number | null; // componente isolado — usado só pelo ranking EVOLUCAO
}

async function coletarDadosVendedor(
  vendedorId: string,
  lojaId: string,
  empresaId: string,
  periodo: PeriodoMeta,
  desde: Date,
  ate: Date,
  hoje: Date
): Promise<DadosVendedor> {
  const [realizado, meta, moedas, baselines, consistencia, regra] = await Promise.all([
    realizadoNoPeriodo(vendedorId, desde, ate),
    metaDoPeriodo(vendedorId, 'FATURAMENTO', periodo, desde),
    getSaldoMoedas(vendedorId),
    recomputarBaselines(vendedorId, inicioDoDia(hoje)),
    consistenciaPct(vendedorId, inicioDoDia(hoje)),
    getRegraAtiva(empresaId),
  ]);

  const percentualMeta = meta && meta > 0 ? (realizado.faturamento / meta) * 100 : 0;
  const baselinePa = baselines.find((b) => b.metrica === 'PA')!;
  const baselineTicket = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;
  const baselineFaturamento = baselines.find((b) => b.metrica === 'FATURAMENTO_DIA')!;

  // baselineFaturamento é sempre uma média DIÁRIA — pra período SEMANA/MES,
  // realizado.faturamento é a SOMA do período, então precisa virar média diária
  // antes de comparar (senão o delta vem inflado ~7x/~30x).
  const faturamentoMedioDiario = realizado.faturamento / diasTranscorridos(desde, ate);

  const resultadoScore = calcularScoreGeral(
    {
      metaPercentual: percentualMeta,
      evolucaoDeltaPct: deltaPercentual(faturamentoMedioDiario, baselineFaturamento),
      paDeltaPct: deltaPercentual(realizado.pa, baselinePa),
      ticketDeltaPct: deltaPercentual(realizado.ticketMedio, baselineTicket),
      consistenciaPct: consistencia,
    },
    regra.pesosScore
  );

  return {
    vendedorId,
    lojaId,
    faturamento: realizado.faturamento,
    percentualMeta,
    pa: realizado.pa,
    ticketMedio: realizado.ticketMedio,
    moedas,
    scoreGeral: resultadoScore.scoreGeral,
    scoreProvisorio: resultadoScore.provisorio,
    evolucaoNorm: resultadoScore.componentesNormalizados.evolucao,
  };
}

/** Coleta os dados de TODOS os vendedores ativos da empresa de uma vez (evita recalcular por loja + de novo pra rede). */
async function coletarDadosEmpresa(empresaId: string, periodo: PeriodoMeta, hoje: Date): Promise<DadosVendedor[]> {
  const referencia = referenciaDoPeriodo(periodo, hoje);
  const vendedores = await prisma.vendedor.findMany({
    where: { empresaId, ativo: true },
    select: { id: true, lojaId: true },
  });

  return Promise.all(vendedores.map((v) => coletarDadosVendedor(v.id, v.lojaId, empresaId, periodo, referencia, hoje, hoje)));
}

const RANKINGS: { tipo: TipoRanking; valorDe: (d: DadosVendedor) => number; provisorioDe?: (d: DadosVendedor) => boolean }[] = [
  { tipo: 'FATURAMENTO', valorDe: (d) => d.faturamento },
  { tipo: 'PERCENTUAL_META', valorDe: (d) => d.percentualMeta },
  { tipo: 'PA', valorDe: (d) => d.pa },
  { tipo: 'TICKET', valorDe: (d) => d.ticketMedio },
  { tipo: 'MOEDAS', valorDe: (d) => d.moedas },
  { tipo: 'SCORE_GERAL', valorDe: (d) => d.scoreGeral, provisorioDe: (d) => d.scoreProvisorio },
  // Ranking de evolução usa SÓ o componente de evolução (delta de faturamento vs.
  // baseline pessoal), não o Score Geral inteiro — senão fica idêntico ao SCORE_GERAL.
  { tipo: 'EVOLUCAO', valorDe: (d) => (d.evolucaoNorm ?? 0) * 10, provisorioDe: (d) => d.evolucaoNorm === null },
];

async function persistirRankings(
  empresaId: string,
  escopo: EscopoRanking,
  lojaId: string | null,
  periodo: PeriodoMeta,
  referencia: Date,
  dados: DadosVendedor[],
  regraVersao: number
) {
  for (const ranking of RANKINGS) {
    const ordenados = [...dados].sort((a, b) => ranking.valorDe(b) - ranking.valorDe(a));

    await prisma.$transaction([
      prisma.rankingSnapshot.deleteMany({
        where: { empresaId, escopo, lojaId, tipo: ranking.tipo, periodo, referencia },
      }),
      prisma.rankingSnapshot.createMany({
        data: ordenados.map((d, idx) => ({
          empresaId,
          escopo,
          lojaId,
          tipo: ranking.tipo,
          periodo,
          referencia,
          vendedorId: d.vendedorId,
          posicao: idx + 1,
          valor: ranking.valorDe(d),
          provisorio: ranking.provisorioDe?.(d) ?? false,
          regraVersao,
        })),
      }),
    ]);
  }
}

/**
 * Recalcula e persiste os 7 rankings paralelos para um escopo (loja ou rede
 * inteira) e período. Idempotente por natureza: sempre recalcula do zero e
 * substitui o snapshot anterior daquele escopo/tipo/período/referência.
 */
export async function recalcularRankings(
  empresaId: string,
  escopo: EscopoRanking,
  lojaId: string | null,
  periodo: PeriodoMeta,
  hoje: Date = new Date()
) {
  const referencia = referenciaDoPeriodo(periodo, hoje);
  const todosDaEmpresa = await coletarDadosEmpresa(empresaId, periodo, hoje);
  const dados = lojaId ? todosDaEmpresa.filter((d) => d.lojaId === lojaId) : todosDaEmpresa;

  const regra = await getRegraAtiva(empresaId);
  await persistirRankings(empresaId, escopo, lojaId, periodo, referencia, dados, regra.versao);

  log.info({ empresaId, escopo, lojaId, periodo, vendedores: dados.length }, 'rankings recalculados');
}

/**
 * Recalcula ranking de loja (para cada loja da empresa) e de rede, pro período
 * DIA. Coleta os dados de cada vendedor UMA vez só (não por loja + de novo pra
 * rede) — o custo de baseline/score por vendedor é caro o suficiente pra não
 * duplicar em toda execução horária do sync.
 */
export async function recalcularTodosOsRankingsDoDia(empresaId: string, hoje: Date = new Date()) {
  const referencia = referenciaDoPeriodo('DIA', hoje);
  const dados = await coletarDadosEmpresa(empresaId, 'DIA', hoje);
  const regra = await getRegraAtiva(empresaId);

  const porLoja = new Map<string, DadosVendedor[]>();
  for (const d of dados) {
    porLoja.set(d.lojaId, [...(porLoja.get(d.lojaId) ?? []), d]);
  }

  for (const [lojaId, dadosDaLoja] of porLoja) {
    await persistirRankings(empresaId, 'LOJA', lojaId, 'DIA', referencia, dadosDaLoja, regra.versao);
  }
  await persistirRankings(empresaId, 'REDE', null, 'DIA', referencia, dados, regra.versao);

  log.info({ empresaId, lojas: porLoja.size, vendedores: dados.length }, 'rankings do dia recalculados (loja + rede)');
}

export async function getRanking(
  empresaId: string,
  escopo: EscopoRanking,
  lojaId: string | null,
  tipo: TipoRanking,
  periodo: PeriodoMeta,
  hoje: Date = new Date()
) {
  const referencia = referenciaDoPeriodo(periodo, hoje);

  const snapshot = await prisma.rankingSnapshot.findMany({
    where: { empresaId, escopo, lojaId, tipo, periodo, referencia },
    orderBy: { posicao: 'asc' },
  });

  const vendedores = await prisma.vendedor.findMany({
    where: { id: { in: snapshot.map((s) => s.vendedorId) } },
    select: { id: true, nome: true },
  });
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

  return snapshot.map((s) => ({ ...s, nomeVendedor: nomePorId.get(s.vendedorId) ?? '—' }));
}
