// Ranking da Fase 1 (D9) — calculado no SERVIDOR, sempre do dado atual.
//
// Ordem: métrica principal (no ranking principal, faturamento em R$) →
// 2º mais ACESSOS ao app no mês → 3º maior TICKET médio → empate permanece
// (mesma posição; a seguinte pula, padrão "1, 1, 3"). Não há 4º critério.
//
// Privacidade (Fatia 7.5A, mantida): o valor em R$ dos colegas NUNCA sai do
// servidor. A linha do próprio vendedor traz o valor e a distância para quem
// está imediatamente acima; nas demais, valor de métrica financeira é null.
//
// "Posição anterior" (↑↓) = o mesmo ranking recalculado com os dados até
// ONTEM — não depende de snapshot persistido, então correções de venda (D4)
// também corrigem a variação.
import { prisma } from '../../db';
import { diaLocal, mesLocal, primeiroDiaDoMes } from '../../tempo/dia';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { getRegraAtiva, REGUA_V1 } from '../../gamificacao/regras.service';
import { ConfigFase1, Metrica, obterConfigFase1 } from '../config.service';
import { EstatisticaVendedor, estatisticasDoMes, ontemDe } from './estatisticas.service';

export interface LinhaRanking {
  pessoaId: string;
  posicao: number;
  posicaoAnterior: number | null;
  /** null quando o valor não pode ser mostrado ao viewer (R$ de colega). */
  valor: number | null;
  /** Só na linha do próprio viewer: quanto falta (na unidade da métrica) para a linha imediatamente acima. */
  distanciaAcima: number | null;
  empatado: boolean;
}

export interface LinhaRankingLoja {
  lojaId: string;
  posicao: number;
  pontos: number;
  posicaoAnterior: number | null;
  distanciaAcima: number | null;
}

const METRICA_FINANCEIRA: Record<Metrica, boolean> = { VENDAS: true, TICKET: true, SCORE: false, PERCENTUAL_META: false, EVOLUCAO: false, PA: false, CONSISTENCIA: false };

export function valorDaMetrica(e: EstatisticaVendedor, metrica: Metrica): number | null {
  switch (metrica) {
    case 'VENDAS':
      return e.mes.faturamento;
    case 'PERCENTUAL_META':
      return e.percentualMeta === null ? null : Math.round(e.percentualMeta * 10) / 10;
    case 'EVOLUCAO':
      return e.evolucaoPp === null ? null : Math.round(e.evolucaoPp * 10) / 10;
    case 'PA':
      return e.pa === null ? null : Math.round(e.pa * 100) / 100;
    case 'TICKET':
      return e.ticket === null ? null : Math.round(e.ticket * 100) / 100;
    case 'CONSISTENCIA':
      return e.consistencia;
    case 'SCORE':
      return e.score;
  }
}

interface Entrada {
  id: string;
  valor: number;
  acessos: number;
  ticket: number;
}

/** Ordena com D9 e atribui posições com empate (pura, testada isoladamente). */
export function ordenarComDesempate(entradas: Entrada[]): (Entrada & { posicao: number; empatado: boolean })[] {
  const ordenadas = [...entradas].sort((a, b) => b.valor - a.valor || b.acessos - a.acessos || b.ticket - a.ticket || a.id.localeCompare(b.id));
  const mesmo = (a: Entrada, b: Entrada) => a.valor === b.valor && a.acessos === b.acessos && a.ticket === b.ticket;
  const resultado: (Entrada & { posicao: number; empatado: boolean })[] = [];
  ordenadas.forEach((e, i) => {
    const anterior = resultado[i - 1];
    const posicao = anterior && mesmo(anterior, e) ? anterior.posicao : i + 1;
    resultado.push({ ...e, posicao, empatado: false });
  });
  for (const r of resultado) r.empatado = resultado.filter((x) => x.posicao === r.posicao).length > 1;
  return resultado;
}

function entradas(ids: string[], stats: Map<string, EstatisticaVendedor>, metrica: Metrica): Entrada[] {
  return ids
    .map((id) => ({ id, s: stats.get(id) }))
    .filter((x): x is { id: string; s: EstatisticaVendedor } => Boolean(x.s))
    .map(({ id, s }) => ({ id, valor: valorDaMetrica(s, metrica), acessos: s.acessosNoMes, ticket: s.ticket ?? 0 }))
    .filter((e): e is Entrada => e.valor !== null);
}

export function montarLinhas(ids: string[], agora: Map<string, EstatisticaVendedor>, ontem: Map<string, EstatisticaVendedor> | null, metrica: Metrica, viewerId: string | null): LinhaRanking[] {
  const atual = ordenarComDesempate(entradas(ids, agora, metrica));
  const anterior = ontem ? new Map(ordenarComDesempate(entradas(ids, ontem, metrica)).map((e) => [e.id, e.posicao])) : new Map<string, number>();
  return atual.map((e) => {
    const souEu = e.id === viewerId;
    const acima = atual.filter((x) => x.posicao < e.posicao).at(-1) ?? null;
    return {
      pessoaId: e.id,
      posicao: e.posicao,
      posicaoAnterior: anterior.get(e.id) ?? null,
      valor: METRICA_FINANCEIRA[metrica] && !souEu && viewerId !== null ? null : e.valor,
      distanciaAcima: souEu && acima ? Math.round((acima.valor - e.valor) * 100) / 100 : null,
      empatado: e.empatado,
    };
  });
}

export interface VisaoRankingEmpresa {
  tz: string;
  hoje: string;
  mes: string;
  config: ConfigFase1;
  elegiveis: { id: string; nome: string; lojaId: string }[];
  agora: Map<string, EstatisticaVendedor>;
  ontem: Map<string, EstatisticaVendedor> | null;
}

/** Elegíveis ao ranking: ACTIVE + VENDEDOR + elegível (exceção do Admin). */
export async function visaoRankingEmpresa(empresaId: string, instante: Date = new Date()): Promise<VisaoRankingEmpresa> {
  const tz = await timezoneDaEmpresa(empresaId);
  const hoje = diaLocal(instante, tz);
  const mes = mesLocal(instante, tz);
  const [config, regra, elegiveis] = await Promise.all([
    obterConfigFase1(empresaId),
    getRegraAtiva(empresaId).catch(() => ({ pesosScore: REGUA_V1.pesosScore })),
    prisma.vendedor.findMany({ where: { empresaId, status: 'ACTIVE', papel: 'VENDEDOR', elegivelRanking: true }, select: { id: true, nome: true, lojaId: true }, orderBy: { nome: 'asc' } }),
  ]);
  const ids = elegiveis.map((v) => v.id);
  const base = { empresaId, vendedorIds: ids, mes, tz, pesos: regra.pesosScore };
  const [agora, ontem] = await Promise.all([
    estatisticasDoMes({ ...base, ateDia: hoje, hoje }),
    hoje === primeiroDiaDoMes(mes) ? Promise.resolve(null) : estatisticasDoMes({ ...base, ateDia: ontemDe(hoje), hoje: ontemDe(hoje) }),
  ]);
  return { tz, hoje, mes, config, elegiveis, agora, ontem };
}

export function rankingsPorMetrica(visao: VisaoRankingEmpresa, ids: string[], viewerId: string | null): Record<Metrica, LinhaRanking[]> {
  const metricas: Metrica[] = ['SCORE', 'VENDAS', 'PERCENTUAL_META', 'EVOLUCAO', 'PA', 'TICKET', 'CONSISTENCIA'];
  return Object.fromEntries(metricas.map((m) => [m, montarLinhas(ids, visao.agora, visao.ontem, m, viewerId)])) as Record<Metrica, LinhaRanking[]>;
}

/** Pontos de uma loja pela fórmula configurada (pura). */
export function pontosDaLoja(formula: ConfigFase1['lojaXLoja']['formula'], stats: EstatisticaVendedor[]): number | null {
  if (!formula || stats.length === 0) return null;
  if (formula === 'MEDIA_SCORE') return Math.round(stats.reduce((a, s) => a + s.score, 0) / stats.length);
  const fat = stats.reduce((a, s) => a + s.mes.faturamento, 0);
  const meta = stats.reduce((a, s) => a + (s.metaMensal ?? 0), 0);
  if (meta <= 0) return null;
  const pctAtual = (fat / meta) * 100;
  if (formula === 'PCT_META_COLETIVA') return Math.round(pctAtual * 10) / 10;
  const fatAnt = stats.reduce((a, s) => a + s.anterior.faturamento, 0);
  const metaAnt = stats.reduce((a, s) => a + (s.anterior.metaMensal ?? 0), 0);
  if (metaAnt <= 0) return null;
  return Math.round((pctAtual - (fatAnt / metaAnt) * 100) * 10) / 10;
}

export function rankingLojas(visao: VisaoRankingEmpresa, lojasValidas: string[]): LinhaRankingLoja[] {
  const { formula, lojas } = visao.config.lojaXLoja;
  if (!visao.config.lojaXLoja.ativo || !formula) return [];
  const participantes = (lojas.length ? lojas : lojasValidas).filter((l) => lojasValidas.includes(l));
  const calc = (stats: Map<string, EstatisticaVendedor> | null) => {
    if (!stats) return new Map<string, number>();
    const lista = participantes
      .map((lojaId) => ({ id: lojaId, pontos: pontosDaLoja(formula, visao.elegiveis.filter((v) => v.lojaId === lojaId).map((v) => stats.get(v.id)!).filter(Boolean)) }))
      .filter((x): x is { id: string; pontos: number } => x.pontos !== null);
    return new Map(ordenarComDesempate(lista.map((x) => ({ id: x.id, valor: x.pontos, acessos: 0, ticket: 0 }))).map((e) => [e.id, e.posicao]));
  };
  const atual = participantes
    .map((lojaId) => ({ lojaId, pontos: pontosDaLoja(formula, visao.elegiveis.filter((v) => v.lojaId === lojaId).map((v) => visao.agora.get(v.id)!).filter(Boolean)) }))
    .filter((x): x is { lojaId: string; pontos: number } => x.pontos !== null);
  const ordem = ordenarComDesempate(atual.map((x) => ({ id: x.lojaId, valor: x.pontos, acessos: 0, ticket: 0 })));
  const anterior = calc(visao.ontem);
  return ordem.map((e, i) => ({ lojaId: e.id, posicao: e.posicao, pontos: e.valor, posicaoAnterior: anterior.get(e.id) ?? null, distanciaAcima: i === 0 ? null : Math.round((ordem[i - 1].valor - e.valor) * 10) / 10 }));
}
