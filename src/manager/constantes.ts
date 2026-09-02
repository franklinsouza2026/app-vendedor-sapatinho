// Painel Gerencial Avançado (Fatia 9) — constantes/erros compartilhados por
// todo o domínio `manager`. Zero motor de KPI paralelo: os thresholds aqui
// só decidem QUANDO um alerta dispara, nunca recalculam um número que já
// existe em Meta/IndicadorRealizado/BaselinePessoal/RankingSnapshot.
export class ManagerError extends Error {
  constructor(
    public type: 'not_found' | 'invalid_transition' | 'forbidden' | 'invalid_reference' | 'already_exists',
    message: string
  ) {
    super(message);
    this.name = 'ManagerError';
  }
}

/** Limite de caracteres pra qualquer texto livre do gerente (1:1, plano de
 * ação) — mesma disciplina do Recognition.message (Fatia 8). */
export const LIMITE_TEXTO_LIVRE = 500;

/** Remove tags HTML e corta no limite — nunca confiar em texto livre vindo
 * do cliente sem sanitizar antes de persistir (XSS, seção 92/114). */
export function sanitizarTextoLivre(texto: string): string {
  return texto.replace(/<[^>]*>/g, '').slice(0, LIMITE_TEXTO_LIVRE);
}

/**
 * Defaults NEUTROS/CONSERVADORES (seção 66-70) — usados quando não há
 * `ManagerAlertConfig` cadastrado para a empresa. Nenhum limiar aqui foi
 * inventado sem base: todos comparam contra a PRÓPRIA baseline do vendedor
 * (`BaselinePessoal`) ou contra uma meta oficial já cadastrada (`Meta`) —
 * nunca um valor absoluto arbitrário de mercado.
 */
export const THRESHOLDS_PADRAO: Record<string, Record<string, number>> = {
  LOW_GOAL_ATTAINMENT: { limiarPercentualDoEsperado: 70 }, // % do PACING esperado no período (dias corridos / dias do período), não do total
  PA_BELOW_BASELINE: { limiarQuedaPercentual: 15 },
  TICKET_BELOW_BASELINE: { limiarQuedaPercentual: 15 },
  CONSISTENCY_DROP: { limiarQuedaPercentual: 20 },
  NO_SALES_RECENTLY: { diasSemVenda: 2 },
  MISSION_STALLED: { diasParado: 3 },
  TRAINING_OVERDUE: { diasAtraso: 3 },
  CERTIFICATION_EXPIRING: { diasParaExpirar: 15 },
  PDI_STALLED: { diasSemEvolucao: 14 },
  COMPETENCY_GAP: { gapMinimoParaAlerta: 25 },
  NO_RECENT_MANAGER_FOLLOWUP: { diasSemFollowup: 21 },
};

/** Ordem de prioridade das SITUAÇÕES (seção 16) — usada pelo
 * ManagerPriorityService, nunca reordenada por IA. */
export const ORDEM_PRIORIDADE_TIPO: Record<string, number> = {
  NO_SALES_RECENTLY: 1,
  LOW_GOAL_ATTAINMENT: 2,
  CONSISTENCY_DROP: 3,
  PA_BELOW_BASELINE: 4,
  TICKET_BELOW_BASELINE: 4,
  MISSION_STALLED: 5,
  PDI_STALLED: 6,
  COMPETENCY_GAP: 6,
  TRAINING_OVERDUE: 7,
  CERTIFICATION_EXPIRING: 8,
  NO_RECENT_MANAGER_FOLLOWUP: 9,
};

export const ORDEM_SEVERIDADE: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
