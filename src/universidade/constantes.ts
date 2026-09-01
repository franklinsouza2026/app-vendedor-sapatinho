// Constantes versionadas do Competency Score Engine (Fatia 7.5E, seção 11-17).
// Mesmo padrão já usado em REGUA_V1 (gamificação, Fatia 2) e CATALOGO_BADGES_V1:
// um objeto de configuração versionado em código, não uma "verdade de
// negócio" inventada — Admin pode ajustar recriando uma versão nova, nunca
// editando a v1 in-place (histórico de evidência já calculado com ela nunca
// muda de sentido silenciosamente).
import { TipoFonteEvidencia } from '@prisma/client';

export class UniversidadeError extends Error {
  constructor(
    public type:
      | 'not_found'
      | 'invalid_transition'
      | 'forbidden'
      | 'invalid_reference'
      | 'already_exists'
      | 'mandamentos_incompletos'
      | 'requisitos_nao_atendidos',
    message: string
  ) {
    super(message);
  }
}

/**
 * Peso por tipo de fonte de evidência (seção 12) — default conservador
 * documentado, não uma régua de negócio validada. Quiz/Simulation pesam
 * mais (avaliação direta de desempenho); Training Completion/Mission pesam
 * pouco (concluir ≠ dominar, seção 22); Manager Assessment pesa como uma
 * avaliação humana qualificada. Performance nunca aparece aqui porque não
 * há gerador automático de evidência PERFORMANCE nesta fatia (seção 26).
 */
export const PESO_POR_FONTE_V1: Record<TipoFonteEvidencia, number> = {
  QUIZ: 1.0,
  DIAGNOSTIC_ASSESSMENT: 1.0,
  SIMULATION: 1.2,
  MANAGER_ASSESSMENT: 1.1,
  TRAINING_COMPLETION: 0.4,
  MISSION: 0.3,
  PERFORMANCE: 0.5,
  CERTIFICATION: 0.6,
  RECERTIFICATION: 0.6,
};

export function pesoDaFonte(sourceType: TipoFonteEvidencia): number {
  return PESO_POR_FONTE_V1[sourceType];
}

/** Score de conclusão sem avaliação (seção 22) — "concluiu" nunca equivale
 * a nota máxima; é um valor conservador fixo, nunca 100. */
export const SCORE_CONCLUSAO_SEM_AVALIACAO = 60;

/** Rating (1-5, seção 27) → score 0-100, escala linear determinística. */
export function ratingParaScore(rating: number): number {
  return Math.max(0, Math.min(100, Math.round((rating / 5) * 100)));
}

/** Mínimo de evidências pra sair de NOT_ENOUGH_DATA (seção 13) — default v1. */
export const MINIMO_EVIDENCIAS_PARA_SCORE = 2;

/** Níveis derivados do score (seção 17) — versionado em código (v1), como
 * os thresholds do Gamification Engine (Fatia 2). */
export const NIVEIS_COMPETENCIA_V1 = [
  { code: 'INICIANTE', label: 'Iniciante', minScore: 0 },
  { code: 'EM_DESENVOLVIMENTO', label: 'Em desenvolvimento', minScore: 40 },
  { code: 'COMPETENTE', label: 'Competente', minScore: 70 },
  { code: 'AVANCADO', label: 'Avançado', minScore: 90 },
] as const;

export function nivelParaScore(score: number): (typeof NIVEIS_COMPETENCIA_V1)[number] {
  let nivel: (typeof NIVEIS_COMPETENCIA_V1)[number] = NIVEIS_COMPETENCIA_V1[0];
  for (const n of NIVEIS_COMPETENCIA_V1) {
    if (score >= n.minScore) nivel = n;
  }
  return nivel;
}

/** Target default por papel (seção 16) quando o Admin ainda não configurou
 * um CompetencyTarget explícito — default conservador documentado, nunca
 * apresentado como meta "oficial" sem o Admin ter revisado. */
export const TARGET_SCORE_DEFAULT = 70;

export type ConfiancaEvidencia = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Confidence determinística (seção 14) — nunca LLM. Deriva de: quantidade
 * de evidências, diversidade de fontes distintas, e atualidade (evidência
 * mais recente dentro da janela de validade padrão). V1 simples e
 * testável, documentado como regra explícita.
 */
export function calcularConfianca(params: { totalEvidencias: number; fontesDistintas: number; diasDesdeUltimaEvidencia: number }): ConfiancaEvidencia {
  if (params.totalEvidencias < MINIMO_EVIDENCIAS_PARA_SCORE) return 'LOW';
  if (params.diasDesdeUltimaEvidencia > 180) return 'LOW';
  if (params.totalEvidencias >= 4 && params.fontesDistintas >= 2 && params.diasDesdeUltimaEvidencia <= 90) return 'HIGH';
  return 'MEDIUM';
}

/** Janela de validade padrão de uma evidência sem `validUntil` explícito
 * (seção 15) — v1 simples (janela fixa), sem decay matemático. */
export const JANELA_VALIDADE_PADRAO_DIAS = 365;

/** Spaced repetition (seção 40-42) — estágios em dias, determinístico e
 * testável. Errar sempre reduz/reseta pro estágio 0; acertar avança 1
 * estágio (nunca pula etapas). */
export const ESTAGIOS_REVISAO_DIAS = [1, 3, 7, 16, 35, 90];
