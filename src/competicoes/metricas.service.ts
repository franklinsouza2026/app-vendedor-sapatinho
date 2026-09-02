// Fairness Engine + calculadores de métrica (Fatia 8, seção 10-15) — 100%
// determinístico, nenhuma fórmula livre armazenada (seção 48). Cada
// metricType tem EXATAMENTE 1 calculador fixo aqui — nunca espalhado por
// controllers, nunca reimplementa um motor de KPI que já existe em outro
// domínio (Gamificação/Universidade/Missões/Academia).
import { Competition, TipoParticipante } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodo } from '../services/metas.service';
import { recomputarBaselines, deltaPercentual } from '../gamificacao/baseline.service';
import { normalizarConsistencia } from '../gamificacao/score';
import { calcularScoreCompetencia } from '../universidade/score-engine.service';
import { MINIMO_DIAS_ATIVOS_PADRAO } from './constantes';

const MINIMO_VENDEDORES_ATIVOS_LOJA = 2;

export interface ResultadoElegibilidade {
  elegivel: boolean;
  motivo?: string;
}

/** Dias com dado disponível (`StreakChecagem`) dentro do período — mesma
 * fonte já usada pelo Ranking pra medir consistência (seção 12: "vendedor
 * precisa ter N dias ativos"). */
async function diasAtivosNoPeriodo(vendedorId: string, desde: Date, ate: Date): Promise<number> {
  return prisma.streakChecagem.count({ where: { vendedorId, tipo: 'META_DIARIA', data: { gte: inicioDoDia(desde), lte: inicioDoDia(ate) } } });
}

/**
 * Batch (seção 100: evitar N+1) — pré-calcula dias ativos de VÁRIOS
 * vendedores de uma vez (1 query, `groupBy`), em vez de 1 query por
 * vendedor. Usado por `garantirParticipantesInscritos` quando inscreve
 * muitos candidatos de uma vez (ex.: primeira ativação da competição).
 */
export async function diasAtivosEmLote(vendedorIds: string[], desde: Date, ate: Date): Promise<Map<string, number>> {
  if (vendedorIds.length === 0) return new Map();
  const grupos = await prisma.streakChecagem.groupBy({
    by: ['vendedorId'],
    where: { vendedorId: { in: vendedorIds }, tipo: 'META_DIARIA', data: { gte: inicioDoDia(desde), lte: inicioDoDia(ate) } },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.vendedorId, g._count._all]));
}

/**
 * Elegibilidade (seção 12/59) — verificada ANTES de calcular a métrica.
 * Nunca usa score 0 como substituto de "sem dados suficientes" (seção 98).
 * `diasAtivosPreCalculado`, quando fornecido, evita uma query individual
 * (seção 100/116) — usado pelo auto-enrollment em lote.
 */
export async function avaliarFairness(competition: Competition, participantType: TipoParticipante, participantId: string, agora: Date = new Date(), diasAtivosPreCalculado?: number): Promise<ResultadoElegibilidade> {
  const fimJanela = agora < competition.endsAt ? agora : competition.endsAt;

  if (participantType === 'STORE') {
    const vendedoresAtivos = await prisma.vendedor.count({ where: { lojaId: participantId, papel: 'VENDEDOR', status: 'ACTIVE' } });
    if (vendedoresAtivos < MINIMO_VENDEDORES_ATIVOS_LOJA) return { elegivel: false, motivo: `loja precisa de ao menos ${MINIMO_VENDEDORES_ATIVOS_LOJA} vendedores ativos` };
    return { elegivel: true };
  }

  const diasAtivos = diasAtivosPreCalculado ?? (await diasAtivosNoPeriodo(participantId, competition.startsAt, fimJanela));
  const minimo = competition.minDiasAtivos ?? MINIMO_DIAS_ATIVOS_PADRAO;
  if (diasAtivos < minimo) return { elegivel: false, motivo: `precisa de ao menos ${minimo} dia(s) ativo(s) no período (tem ${diasAtivos})` };

  if (competition.metricType === 'PERSONAL_IMPROVEMENT' || competition.metricType === 'PA' || competition.metricType === 'TICKET_MEDIO') {
    const baselines = await recomputarBaselines(participantId, inicioDoDia(competition.startsAt));
    const relevante = competition.metricType === 'PA' ? 'PA' : competition.metricType === 'TICKET_MEDIO' ? 'TICKET_MEDIO' : 'FATURAMENTO_DIA';
    const baseline = baselines.find((b) => b.metrica === relevante);
    if (!baseline?.amostraSuficiente) return { elegivel: false, motivo: 'baseline pessoal ainda em formação (amostra insuficiente) — nunca usamos 0 como substituto' };
  }

  if (competition.metricType === 'COMPETENCY_EVOLUTION') {
    if (!competition.competencyId) return { elegivel: false, motivo: 'competição sem competência configurada' };
    const scoreInicial = await calcularScoreCompetencia(participantId, competition.competencyId, competition.startsAt);
    if (scoreInicial.status === 'NOT_ENOUGH_DATA') return { elegivel: false, motivo: 'sem evidência suficiente da competência no início da competição' };
  }

  return { elegivel: true };
}

export interface ResultadoMetrica {
  score: number; // sempre "maior é melhor"
  consistencia: number | null; // % — usado só pro tie-break
}

/** Consistência (% de dias com meta batida no período) — reusa a mesma
 * normalização do Ranking (score.ts), nunca uma 2ª fórmula. */
async function calcularConsistenciaNoPeriodo(vendedorId: string, desde: Date, ate: Date): Promise<number | null> {
  const checagens = await prisma.streakChecagem.findMany({ where: { vendedorId, tipo: 'META_DIARIA', data: { gte: inicioDoDia(desde), lte: inicioDoDia(ate) } } });
  if (checagens.length === 0) return null;
  return normalizarConsistencia(checagens.filter((c) => c.atingiu).length, checagens.length);
}

// 1 query pro período inteiro (seção 100/116: evitar N+1) — a versão
// anterior fazia 1 query por DIA do período (uma competição de 90 dias
// faria 90 queries sequenciais só pra este cálculo, por vendedor).
async function metaTotalNoPeriodo(vendedorId: string, desde: Date, ate: Date): Promise<number> {
  const metas = await prisma.meta.findMany({
    where: { vendedorId, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: { gte: inicioDoDia(desde), lte: inicioDoDia(ate) } },
    select: { valorMeta: true },
  });
  return metas.reduce((acc, m) => acc + Number(m.valorMeta), 0);
}

async function scoreGeralMaisRecente(vendedorId: string, ateReferencia: Date): Promise<number | null> {
  const snapshot = await prisma.rankingSnapshot.findFirst({
    where: { vendedorId, tipo: 'SCORE_GERAL', referencia: { lte: ateReferencia } },
    orderBy: { referencia: 'desc' },
  });
  return snapshot ? Number(snapshot.valor) : null;
}

/**
 * Calcula o score bruto do participante pra ranking da competição — sempre
 * determinístico, nunca IA, nunca recalcula um motor que já existe (Score
 * Geral vem do RankingSnapshot já persistido, seção 54: "nunca recalcular").
 */
export async function calcularMetrica(competition: Competition, participantType: TipoParticipante, participantId: string, agora: Date = new Date()): Promise<ResultadoMetrica> {
  const fimJanela = agora < competition.endsAt ? agora : competition.endsAt;

  if (participantType === 'STORE') {
    // Métrica de loja: média do % de attainment dos vendedores ativos —
    // nunca faturamento bruto somado (favoreceria loja grande, seção 11/24).
    const vendedores = await prisma.vendedor.findMany({ where: { lojaId: participantId, papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true } });
    if (vendedores.length === 0) return { score: 0, consistencia: null };
    const porVendedor = await Promise.all(vendedores.map((v) => calcularMetrica(competition, 'SELLER', v.id, agora)));
    return { score: porVendedor.reduce((acc, r) => acc + r.score, 0) / porVendedor.length, consistencia: null };
  }

  switch (competition.metricType) {
    case 'GOAL_ATTAINMENT': {
      const [realizado, metaTotal] = await Promise.all([realizadoNoPeriodo(participantId, competition.startsAt, fimJanela), metaTotalNoPeriodo(participantId, competition.startsAt, fimJanela)]);
      const consistencia = await calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela);
      return { score: metaTotal > 0 ? (realizado.faturamento / metaTotal) * 100 : 0, consistencia };
    }
    case 'PA': {
      const [realizado, baselines, consistencia] = await Promise.all([
        realizadoNoPeriodo(participantId, competition.startsAt, fimJanela),
        recomputarBaselines(participantId, inicioDoDia(competition.startsAt)),
        calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela),
      ]);
      const baseline = baselines.find((b) => b.metrica === 'PA')!;
      return { score: deltaPercentual(realizado.pa, baseline) ?? 0, consistencia };
    }
    case 'TICKET_MEDIO': {
      const [realizado, baselines, consistencia] = await Promise.all([
        realizadoNoPeriodo(participantId, competition.startsAt, fimJanela),
        recomputarBaselines(participantId, inicioDoDia(competition.startsAt)),
        calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela),
      ]);
      const baseline = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;
      return { score: deltaPercentual(realizado.ticketMedio, baseline) ?? 0, consistencia };
    }
    case 'SCORE_GERAL': {
      const [score, consistencia] = await Promise.all([scoreGeralMaisRecente(participantId, fimJanela), calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela)]);
      return { score: score ?? 0, consistencia };
    }
    case 'PERSONAL_IMPROVEMENT': {
      const [scoreInicial, scoreAtual, consistencia] = await Promise.all([
        scoreGeralMaisRecente(participantId, competition.startsAt),
        scoreGeralMaisRecente(participantId, fimJanela),
        calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela),
      ]);
      if (scoreInicial === null || scoreAtual === null) return { score: 0, consistencia };
      return { score: scoreAtual - scoreInicial, consistencia };
    }
    case 'COMPETENCY_EVOLUTION': {
      if (!competition.competencyId) return { score: 0, consistencia: null };
      const [scoreInicial, scoreAtual] = await Promise.all([
        calcularScoreCompetencia(participantId, competition.competencyId, competition.startsAt),
        calcularScoreCompetencia(participantId, competition.competencyId, fimJanela),
      ]);
      if (scoreInicial.status === 'NOT_ENOUGH_DATA' || scoreAtual.status === 'NOT_ENOUGH_DATA' || scoreInicial.score === null || scoreAtual.score === null) return { score: 0, consistencia: null };
      return { score: scoreAtual.score - scoreInicial.score, consistencia: null };
    }
    case 'TRAINING': {
      const concluidas = await prisma.academyProgress.count({ where: { vendedorId: participantId, status: 'COMPLETED', completedAt: { gte: competition.startsAt, lte: fimJanela } } });
      const consistencia = await calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela);
      return { score: concluidas, consistencia };
    }
    case 'MISSION_COMPLETION': {
      const concluidas = await prisma.missionAssignment.count({ where: { vendedorId: participantId, status: 'COMPLETED', completedAt: { gte: competition.startsAt, lte: fimJanela } } });
      const consistencia = await calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela);
      return { score: concluidas, consistencia };
    }
    case 'CONSISTENCY': {
      const consistencia = await calcularConsistenciaNoPeriodo(participantId, competition.startsAt, fimJanela);
      return { score: consistencia ?? 0, consistencia };
    }
    case 'CUSTOM_RULE':
    default:
      // Nunca implementado por design (seção 48: sem eval/fórmula arbitrária) —
      // uma Competition com esse metricType nunca deveria ter sido criada
      // (bloqueado na validação do Admin), mas se existir, score 0 nunca falha.
      return { score: 0, consistencia: null };
  }
}
