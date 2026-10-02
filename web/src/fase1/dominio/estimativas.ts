/**
 * Cálculos de EXIBIÇÃO da Fase 1 — transformam número em "quanto falta".
 *
 * ⚠️ REGRA DE NEGÓCIO AINDA NÃO CONGELADA. Tudo aqui é provisório, foi
 * escolhido para homologar a experiência e precisa ser confirmado (ou movido
 * para o backend) na etapa de conexão. Cada função diz qual decisão está aberta.
 *
 * Princípio que NÃO é provisório: toda estimativa é apresentada como
 * estimativa ("≈", "aproximadamente"), nunca como certeza, e some quando não
 * há base para ela — melhor não mostrar do que inventar precisão.
 */
import type { LinhaRankingBruta, LinhaRankingLoja, Metrica } from './tipos';

/** Marcos de meta diária — os mesmos do ledger atual (META_DIARIA_100/110/120/150). */
export const MARCOS_META = [100, 110, 120, 150] as const;

export function percentual(realizado: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return (realizado / meta) * 100;
}

export function falta(realizado: number, meta: number | null): number | null {
  if (meta === null) return null;
  return Math.max(0, meta - realizado);
}

/**
 * Vendas estimadas para cobrir um valor em R$.
 * DECISÃO ABERTA: arredondar para cima (hoje) — "faltam 1,3 vendas" vira 2,
 * para nunca prometer menos esforço do que o necessário.
 */
export function vendasEstimadas(valor: number, ticketMedio: number | null): number | null {
  if (ticketMedio === null || ticketMedio <= 0 || valor <= 0) return null;
  return Math.ceil(valor / ticketMedio);
}

/** Pares estimados = vendas estimadas × PA. DECISÃO ABERTA: usar PA do mês do vendedor. */
export function paresEstimados(vendas: number | null, pa: number | null): number | null {
  if (vendas === null || pa === null || pa <= 0) return null;
  return Math.round(vendas * pa);
}

/**
 * Vendas por dia de trabalho para cobrir o restante.
 * DECISÃO ABERTA: "dia de trabalho" depende de escala, que não existe no
 * backend hoje. O mock informa os dias; sem eles, não há ritmo.
 */
export function vendasPorDia(vendas: number | null, diasRestantes: number | null): number | null {
  if (vendas === null || diasRestantes === null || diasRestantes <= 0) return null;
  return Math.ceil(vendas / diasRestantes);
}

/**
 * Projeção linear do mês: média por dia trabalhado (hoje incluso) × total de
 * dias de trabalho. Só com ≥ 3 dias trabalhados — antes disso é ruído.
 */
export function projecaoMes(faturamento: number, diasTrabalhados: number, diasRestantes: number | null): number | null {
  if (diasRestantes === null || diasTrabalhados < 3) return null;
  return (faturamento / diasTrabalhados) * (diasTrabalhados + diasRestantes);
}

export interface ProximoMarco {
  marco: number;
  faltaReais: number;
}

/** Depois de bater 100%, qual o próximo marco e quanto falta para ele. null = passou de 150%. */
export function proximoMarco(realizado: number, meta: number | null): ProximoMarco | null {
  if (meta === null || meta <= 0) return null;
  const pct = (realizado / meta) * 100;
  const marco = MARCOS_META.find((m) => pct < m);
  if (marco === undefined) return null;
  return { marco, faltaReais: Math.max(0, (meta * marco) / 100 - realizado) };
}

export function marcosAtingidos(realizado: number, meta: number | null): number[] {
  const pct = percentual(realizado, meta);
  if (pct === null) return [];
  return MARCOS_META.filter((m) => pct >= m);
}

// ---------------------------------------------------------------- ranking

/** Maior é melhor em todas as métricas da Fase 1. */
export interface PosicaoCalculada<T> {
  linha: T;
  posicao: number;
  /** Diferença para a posição imediatamente acima, na unidade da métrica. null para o 1º. */
  distanciaAcima: number | null;
  variacao: number | null; // positivo = subiu
}

export function ordenarRanking(linhas: LinhaRankingBruta[]): PosicaoCalculada<LinhaRankingBruta>[] {
  const ordenadas = [...linhas].sort((a, b) => b.valor - a.valor);
  return ordenadas.map((linha, i) => ({
    linha,
    posicao: i + 1,
    distanciaAcima: i === 0 ? null : ordenadas[i - 1].valor - linha.valor,
    variacao: linha.posicaoAnterior === null ? null : linha.posicaoAnterior - (i + 1),
  }));
}

export function ordenarRankingLojas(linhas: LinhaRankingLoja[]): PosicaoCalculada<LinhaRankingLoja>[] {
  const ordenadas = [...linhas].sort((a, b) => b.pontos - a.pontos);
  return ordenadas.map((linha, i) => ({
    linha,
    posicao: i + 1,
    distanciaAcima: i === 0 ? null : ordenadas[i - 1].pontos - linha.pontos,
    variacao: linha.posicaoAnterior === null ? null : linha.posicaoAnterior - (i + 1),
  }));
}

/**
 * Unidade de cada métrica — a distância no ranking SEMPRE fala a língua da
 * métrica (nunca R$ num ranking de PA). Só VENDAS converte em "vendas no seu
 * ticket médio", porque é a única em que R$ a mais = venda a mais.
 */
export const UNIDADE_METRICA: Record<Metrica, { rotulo: string; curto: string; formato: 'reais' | 'pontos' | 'pp' | 'decimal' | 'dias'; converteEmVendas: boolean; ajuda: string }> = {
  SCORE: { rotulo: 'Score Geral', curto: 'Score', formato: 'pontos', converteEmVendas: false, ajuda: 'Combina meta, evolução, PA e ticket. Fórmula atual do backend (score.ts).' },
  VENDAS: { rotulo: 'Vendas (R$)', curto: 'Vendas', formato: 'reais', converteEmVendas: true, ajuda: 'Faturamento no período. O valor dos colegas fica oculto — só a distância aparece.' },
  PERCENTUAL_META: { rotulo: '% da Meta', curto: '% Meta', formato: 'pp', converteEmVendas: false, ajuda: 'Quanto da própria meta cada um já atingiu. Compara esforço, não tamanho de loja.' },
  EVOLUCAO: { rotulo: 'Evolução', curto: 'Evolução', formato: 'pp', converteEmVendas: false, ajuda: 'Crescimento do % da meta contra o próprio histórico. Quem está começando também pode liderar.' },
  PA: { rotulo: 'PA (peças por atendimento)', curto: 'PA', formato: 'decimal', converteEmVendas: false, ajuda: 'Média de pares por venda.' },
  TICKET: { rotulo: 'Ticket médio', curto: 'Ticket', formato: 'reais', converteEmVendas: false, ajuda: 'Valor médio por venda.' },
  CONSISTENCIA: { rotulo: 'Consistência', curto: 'Consistência', formato: 'dias', converteEmVendas: false, ajuda: 'Dias do mês com a meta diária batida.' },
};
