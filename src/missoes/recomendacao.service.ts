// MissionRecommendationService (Fatia 7, seção 14/26/27) — 100% determinístico,
// sem LLM. Prioridade fixa e auditável: risco de meta → oportunidade de
// PA/ticket → consistência → desenvolvimento → prática. Só recomenda uma
// missão se ela ainda for RELEVANTE (nunca sugere "melhore seu PA" pra quem
// já bateu, seção 26) — reaproveita a mesma avaliação de critério usada pra
// decidir conclusão, nunca uma segunda lógica paralela.
import { env } from '../config';
import { CriterioMissao } from '@prisma/client';
import { inicioDoDia } from '../services/metas.service';
import { avaliarCriterio } from './criterio.service';

// Ordem = prioridade (seção 27: "1. risco/meta; 2. oportunidade PA/ticket;
// 3. consistência; 4. desenvolvimento; 5. prática"). Auditável e testável —
// nunca um score matemático complexo.
const ORDEM_PRIORIDADE: CriterioMissao[] = [
  'DAILY_GOAL',
  'PA_IMPROVEMENT',
  'TICKET_IMPROVEMENT',
  'STREAK_3',
  'COMPLETE_LESSON',
  'PASS_QUIZ',
  'COMPLETE_SIMULATION',
];

/**
 * Retorna os criterionType elegíveis pra atribuição hoje, em ordem de
 * prioridade, limitado a `MISSOES_MAX_ATIVAS_POR_DIA`. Uma missão só é
 * elegível se ainda não foi cumprida hoje E fizer sentido pro vendedor (ex.:
 * PA_IMPROVEMENT exige baseline com amostra suficiente).
 */
export async function recomendarMissoesDoDia(vendedorId: string, agora: Date = new Date()): Promise<CriterioMissao[]> {
  const hoje = inicioDoDia(agora);
  const selecionadas: CriterioMissao[] = [];

  for (const criterio of ORDEM_PRIORIDADE) {
    if (selecionadas.length >= env.MISSOES_MAX_ATIVAS_POR_DIA) break;

    const resultado = await avaliarCriterio(criterio, vendedorId, { inicio: hoje, fim: agora });

    // Já cumprida hoje — nunca re-sugerir a mesma missão hoje (evita "spam"
    // de recompensa/atribuição, mesmo que o bônus seja 0 por padrão).
    if (resultado.atingido) continue;

    // Sem meta cadastrada (progressoAlvo=0) — DAILY_GOAL não é relevante hoje.
    if (criterio === 'DAILY_GOAL' && resultado.progressoAlvo <= 0) continue;

    // Baseline ainda "em formação" (nunca inventamos alvo sem amostra
    // suficiente — mesma disciplina de baseline.service.ts) — sem alvo válido,
    // a missão não é relevante ainda.
    if ((criterio === 'PA_IMPROVEMENT' || criterio === 'TICKET_IMPROVEMENT') && resultado.progressoAlvo <= 0) continue;

    selecionadas.push(criterio);
  }

  return selecionadas;
}
