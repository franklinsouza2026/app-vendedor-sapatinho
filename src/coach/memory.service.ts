// Memória profissional mínima (seção 13 da fonte de verdade). Derivação
// determinística a partir de baseline vs. realizado do dia — NUNCA escrita
// pelo LLM, nunca guarda conteúdo emocional/pessoal. Recalculada sempre que
// o contexto do Coach é montado (barato: 2 queries), sem job separado —
// "não construir sistema complexo de memória automática nesta fatia".
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodo } from '../services/metas.service';
import { recomputarBaselines, deltaPercentual } from '../gamificacao/baseline.service';
import { calcularMatrizCompetencias } from '../universidade/score-engine.service';

// v1 (decisão explícita, mesmo limiar já usado em motor.service.ts pra
// "melhora validada"): +/-5% vs. baseline pessoal define força/desenvolvimento.
const LIMIAR_PCT = 5;

/** Gap de competência já calculado pela Universidade (Etapa 2A). */
export interface GapDeCompetencia {
  nome: string;
  score: number;
  target: number;
  gap: number;
  prioridade: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MemoriaProfissional {
  /** Origem KPI (PA/ticket vs. baseline pessoal). Inalterado desde a Fatia 4. */
  strengths: string[];
  /** Origem KPI. */
  developmentAreas: string[];
  /** Origem KPI. */
  currentFocus: string | null;
  summary: string | null;
  /**
   * Origem EVIDÊNCIA (aula, quiz, simulação, avaliação do gerente) — nunca KPI.
   *
   * Campo SEPARADO de propósito (Etapa 2A). O produto tinha dois vocabulários
   * de desenvolvimento que não se falavam: `ProfessionalMemory` dizia "seu
   * ponto fraco é ticket médio" para os 3 módulos de IA, enquanto
   * `CompetencyEvidence` dizia "seu ponto fraco é QUEBRA_DE_OBJECOES" só para
   * duas telas. Este campo é a ponte — mas mantendo as origens distinguíveis:
   * fundir tudo numa lista só tornaria impossível saber se um item veio de
   * indicador ou de evidência, e a régua KPI→Competência é decisão de negócio
   * que pertence à Etapa 2B, não a esta.
   *
   * Nunca é persistido: deriva da matriz, que já é calculada sob demanda —
   * persistir criaria uma segunda fonte de verdade fadada a ficar velha.
   */
  competencyGaps: GapDeCompetencia[];
}

/** Só os gaps que valem virar foco — nunca a matriz inteira no prompt. */
const MAX_GAPS_NO_CONTEXTO = 3;

export async function getMemoria(vendedorId: string, agora: Date = new Date()): Promise<MemoriaProfissional> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const hoje = inicioDoDia(agora);
  // A matriz entra no mesmo paralelo: `getMemoria` está no caminho quente de
  // TODO request do Conselheiro e do Treinador, e ela só depende de
  // `vendedor.papel`, já resolvido acima — não há motivo pra ficar em série.
  const [baselines, realizadoHoje, matriz] = await Promise.all([
    recomputarBaselines(vendedorId, hoje),
    realizadoNoPeriodo(vendedorId, hoje, agora),
    calcularMatrizCompetencias(vendedorId, vendedor.papel, agora),
  ]);

  const baselinePa = baselines.find((b) => b.metrica === 'PA')!;
  const baselineTicket = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;

  const deltaPa = deltaPercentual(realizadoHoje.pa, baselinePa);
  const deltaTicket = deltaPercentual(realizadoHoje.ticketMedio, baselineTicket);

  const strengths: string[] = [];
  const developmentAreas: string[] = [];

  if (deltaPa !== null) {
    if (deltaPa >= LIMIAR_PCT) strengths.push('PA');
    else if (deltaPa <= -LIMIAR_PCT) developmentAreas.push('PA');
  }
  if (deltaTicket !== null) {
    if (deltaTicket >= LIMIAR_PCT) strengths.push('ticket médio');
    else if (deltaTicket <= -LIMIAR_PCT) developmentAreas.push('ticket médio');
  }

  const currentFocus = developmentAreas[0] ?? null;
  const summary =
    strengths.length === 0 && developmentAreas.length === 0
      ? null
      : [
          strengths.length > 0 ? `Pontos fortes: ${strengths.join(', ')}.` : null,
          developmentAreas.length > 0 ? `Em desenvolvimento: ${developmentAreas.join(', ')}.` : null,
        ]
          .filter(Boolean)
          .join(' ');

  // Gaps de competência (Etapa 2A) — ordenados por prioridade e tamanho do
  // gap, cortados em MAX_GAPS_NO_CONTEXTO. Só entram competências que já têm
  // evidência suficiente: `NOT_ENOUGH_DATA` tem score null e fica de fora, pra
  // a IA nunca falar de um gap que o motor ainda não sabe se existe.
  const ordemPrioridade = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  const competencyGaps: GapDeCompetencia[] = matriz
    .filter((c): c is typeof c & { score: number; gap: number } => c.score !== null && c.gap !== null && c.gap > 0)
    .sort((a, b) => ordemPrioridade[a.priority] - ordemPrioridade[b.priority] || b.gap - a.gap)
    .slice(0, MAX_GAPS_NO_CONTEXTO)
    .map((c) => ({ nome: c.name, score: c.score, target: c.target, gap: c.gap, prioridade: c.priority }));

  const memoria: MemoriaProfissional = { strengths, developmentAreas, currentFocus, summary, competencyGaps };

  await prisma.professionalMemory.upsert({
    where: { vendedorId },
    create: {
      empresaId: vendedor.empresaId,
      vendedorId,
      strengths,
      developmentAreas,
      currentFocus,
      summary,
    },
    update: { strengths, developmentAreas, currentFocus, summary },
  });

  return memoria;
}
