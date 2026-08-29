// Memória profissional mínima (seção 13 da fonte de verdade). Derivação
// determinística a partir de baseline vs. realizado do dia — NUNCA escrita
// pelo LLM, nunca guarda conteúdo emocional/pessoal. Recalculada sempre que
// o contexto do Coach é montado (barato: 2 queries), sem job separado —
// "não construir sistema complexo de memória automática nesta fatia".
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodo } from '../services/metas.service';
import { recomputarBaselines, deltaPercentual } from '../gamificacao/baseline.service';

// v1 (decisão explícita, mesmo limiar já usado em motor.service.ts pra
// "melhora validada"): +/-5% vs. baseline pessoal define força/desenvolvimento.
const LIMIAR_PCT = 5;

export interface MemoriaProfissional {
  strengths: string[];
  developmentAreas: string[];
  currentFocus: string | null;
  summary: string | null;
}

export async function getMemoria(vendedorId: string, agora: Date = new Date()): Promise<MemoriaProfissional> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const hoje = inicioDoDia(agora);
  const [baselines, realizadoHoje] = await Promise.all([recomputarBaselines(vendedorId, hoje), realizadoNoPeriodo(vendedorId, hoje, agora)]);

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

  const memoria: MemoriaProfissional = { strengths, developmentAreas, currentFocus, summary };

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
