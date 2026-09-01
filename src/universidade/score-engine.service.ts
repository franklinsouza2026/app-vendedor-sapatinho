// CompetencyScoreEngine + CompetencyGapEngine (Fatia 7.5E, seção 11/18) —
// 100% determinístico, IA nunca participa do cálculo. Evidências expiradas
// (validUntil no passado, ou fora da janela padrão sem validUntil) nunca
// entram na média.
import { CompetencyEvidence, Papel, PublicoConteudo } from '@prisma/client';
import { prisma } from '../db';
import { JANELA_VALIDADE_PADRAO_DIAS, TARGET_SCORE_DEFAULT, calcularConfianca, nivelParaScore, pesoDaFonte, MINIMO_EVIDENCIAS_PARA_SCORE } from './constantes';
import { getTargetEfetivo } from './competency.service';

export interface ScoreCompetencia {
  competencyId: string;
  score: number | null; // null = NOT_ENOUGH_DATA
  status: 'OK' | 'NOT_ENOUGH_DATA';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  lastEvidenceAt: Date | null;
  evidenceCount: number;
  breakdown: { sourceType: string; count: number; avgScore: number }[];
}

function evidenciaValida(e: { occurredAt: Date; validUntil: Date | null }, agora: Date): boolean {
  if (e.validUntil) return e.validUntil >= agora;
  const limite = new Date(e.occurredAt);
  limite.setDate(limite.getDate() + JANELA_VALIDADE_PADRAO_DIAS);
  return limite >= agora;
}

/** Núcleo puro do Score Engine — nunca toca o banco, sempre a partir de
 * evidências já carregadas. `calcularScoreCompetencia` (1 competência) e
 * `calcularMatrizCompetencias` (N competências, 1 única query de evidência
 * pra evitar N+1, seção 98) chamam esta mesma função. */
function computarScore(competencyId: string, evidencias: CompetencyEvidence[], agora: Date): ScoreCompetencia {
  const validas = evidencias.filter((e) => evidenciaValida(e, agora)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  if (validas.length < MINIMO_EVIDENCIAS_PARA_SCORE) {
    return { competencyId, score: null, status: 'NOT_ENOUGH_DATA', confidence: null, lastEvidenceAt: validas[0]?.occurredAt ?? null, evidenceCount: validas.length, breakdown: [] };
  }

  let somaPonderada = 0;
  let somaPesos = 0;
  const porFonte = new Map<string, { soma: number; count: number }>();
  for (const e of validas) {
    const peso = pesoDaFonte(e.sourceType);
    somaPonderada += e.normalizedScore * peso;
    somaPesos += peso;
    const atual = porFonte.get(e.sourceType) ?? { soma: 0, count: 0 };
    atual.soma += e.normalizedScore;
    atual.count += 1;
    porFonte.set(e.sourceType, atual);
  }
  const score = Math.round(somaPonderada / somaPesos);

  const fontesDistintas = porFonte.size;
  const diasDesdeUltimaEvidencia = Math.floor((agora.getTime() - validas[0].occurredAt.getTime()) / (24 * 60 * 60 * 1000));
  const confidence = calcularConfianca({ totalEvidencias: validas.length, fontesDistintas, diasDesdeUltimaEvidencia });

  return {
    competencyId,
    score,
    status: 'OK',
    confidence,
    lastEvidenceAt: validas[0].occurredAt,
    evidenceCount: validas.length,
    breakdown: [...porFonte.entries()].map(([sourceType, v]) => ({ sourceType, count: v.count, avgScore: Math.round(v.soma / v.count) })),
  };
}

/** Calcula o score de UMA competência pra um usuário — sempre a partir de
 * evidências reais persistidas, nunca um valor "estimado" por IA. */
export async function calcularScoreCompetencia(subjectUserId: string, competencyId: string, agora: Date = new Date()): Promise<ScoreCompetencia> {
  const evidencias = await prisma.competencyEvidence.findMany({ where: { subjectUserId, competencyId } });
  return computarScore(competencyId, evidencias, agora);
}

export interface GapCompetencia {
  competencyId: string;
  score: number | null;
  target: number;
  gap: number | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OK' | 'NOT_ENOUGH_DATA';
}

function computarGap(scoreInfo: ScoreCompetencia, target: number): GapCompetencia {
  if (scoreInfo.status === 'NOT_ENOUGH_DATA' || scoreInfo.score === null) {
    return { competencyId: scoreInfo.competencyId, score: null, target, gap: null, priority: 'MEDIUM', status: 'NOT_ENOUGH_DATA' };
  }
  const gap = Math.max(0, target - scoreInfo.score);
  const priority: GapCompetencia['priority'] = gap >= 25 ? 'HIGH' : gap >= 10 ? 'MEDIUM' : 'LOW';
  return { competencyId: scoreInfo.competencyId, score: scoreInfo.score, target, gap, priority, status: 'OK' };
}

/** CompetencyGapEngine (seção 18) — sem IA, só aritmética sobre score/target. */
export async function calcularGap(subjectUserId: string, competencyId: string, papel: Papel, agora: Date = new Date()): Promise<GapCompetencia> {
  const [scoreInfo, target] = await Promise.all([calcularScoreCompetencia(subjectUserId, competencyId, agora), getTargetEfetivo(competencyId, papel)]);
  return computarGap(scoreInfo, target);
}

/**
 * Matriz completa de um usuário (seção 29/30) — SEMPRE 2 queries no total
 * (evidências + targets), nunca N+1: evidência de todas as competências do
 * usuário é buscada de uma vez e agrupada em memória, e os targets
 * explícitos (quando existirem) também são buscados em lote. Achado do
 * self code-review (seção 98/99): a versão anterior chamava
 * `calcularScoreCompetencia` duas vezes por competência (uma direta, outra
 * dentro de `calcularGap`) e `getTargetEfetivo` uma vez por competência.
 */
export async function calcularMatrizCompetencias(subjectUserId: string, papel: Papel, agora: Date = new Date()) {
  const audienciasPermitidas: PublicoConteudo[] = papel === 'GERENTE' ? ['MANAGER', 'BOTH'] : ['SELLER', 'BOTH'];
  const competencias = await prisma.competency.findMany({ where: { status: 'ACTIVE', audience: { in: audienciasPermitidas } }, orderBy: { name: 'asc' } });
  if (competencias.length === 0) return [];

  const competencyIds = competencias.map((c) => c.id);
  const [todasEvidencias, targets] = await Promise.all([
    prisma.competencyEvidence.findMany({ where: { subjectUserId, competencyId: { in: competencyIds } } }),
    prisma.competencyTarget.findMany({ where: { competencyId: { in: competencyIds }, papel, active: true } }),
  ]);

  const evidenciasPorCompetencia = new Map<string, CompetencyEvidence[]>();
  for (const e of todasEvidencias) {
    const lista = evidenciasPorCompetencia.get(e.competencyId) ?? [];
    lista.push(e);
    evidenciasPorCompetencia.set(e.competencyId, lista);
  }
  const targetPorCompetencia = new Map(targets.map((t) => [t.competencyId, t.targetScore]));

  return competencias.map((c) => {
    const scoreInfo = computarScore(c.id, evidenciasPorCompetencia.get(c.id) ?? [], agora);
    const gapInfo = computarGap(scoreInfo, targetPorCompetencia.get(c.id) ?? TARGET_SCORE_DEFAULT);
    return {
      ...scoreInfo,
      competencyId: c.id,
      code: c.code,
      name: c.name,
      category: c.category,
      nivel: scoreInfo.score !== null ? nivelParaScore(scoreInfo.score).code : null,
      target: gapInfo.target,
      gap: gapInfo.gap,
      priority: gapInfo.priority,
    };
  });
}
