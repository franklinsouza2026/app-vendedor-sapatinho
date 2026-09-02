// Constantes versionadas de Competições/Seasons (Fatia 8, seção 12-16) —
// mesmo padrão já usado em REGUA_V1 (gamificação)/PESO_POR_FONTE_V1
// (Universidade): configuração explícita em código, nunca fórmula livre
// armazenada no banco (seção 48 — proibido eval/JS/SQL arbitrário).
import { TipoMetricaCompeticao } from '@prisma/client';

export class CompeticoesError extends Error {
  constructor(
    public type: 'not_found' | 'invalid_transition' | 'forbidden' | 'invalid_reference' | 'already_exists' | 'ineligible',
    message: string
  ) {
    super(message);
  }
}

/** Métricas com calculador determinístico implementado nesta fatia (seção
 * 10: "não necessariamente implementar todas com regra ativa"). CUSTOM_RULE
 * fica de fora por design — nunca teria uma implementação seguindo a regra
 * "nenhuma expressão executável" (seção 48), então nunca ganha calculador. */
export const METRICAS_COM_CALCULADOR: TipoMetricaCompeticao[] = [
  'GOAL_ATTAINMENT',
  'PERSONAL_IMPROVEMENT',
  'SCORE_GERAL',
  'PA',
  'TICKET_MEDIO',
  'TRAINING',
  'COMPETENCY_EVOLUTION',
  'MISSION_COMPLETION',
  'CONSISTENCY',
];

/** Fairness padrão (seção 12) — v1 simples e documentado, ajustável por
 * competição (`Competition.minDiasAtivos`), nunca um algoritmo obscuro. */
export const MINIMO_DIAS_ATIVOS_PADRAO = 5;

/** Seed v1 de ligas (seção 18) — administrável, nunca hardcoded no motor;
 * `sortOrder` é quem decide a ordem real, os 4 nomes clássicos são só o
 * ponto de partida. */
export const LIGAS_SEED_V1 = [
  { code: 'bronze', name: 'Bronze', sortOrder: 0, promotionThreshold: 3 },
  { code: 'prata', name: 'Prata', sortOrder: 1, promotionThreshold: 3, relegationThreshold: 3 },
  { code: 'ouro', name: 'Ouro', sortOrder: 2, promotionThreshold: 3, relegationThreshold: 3 },
  { code: 'diamante', name: 'Diamante', sortOrder: 3, relegationThreshold: 3 },
];

// Tie-break fixo (seção 15) — nunca configurável por competição (evita
// reintroduzir "fórmula arbitrária" pela porta dos fundos): 1) melhor score
// (métrica principal); 2) maior consistência (%); 3) participantId como
// último desempate técnico (nunca decide por si só). Implementado em
// `calcularRankingCompetition` (competitions.service.ts).
