// CoachContextBuilder — seção 6 da fonte de verdade. Resolve tudo a partir do
// vendedorId (sempre do JWT, nunca de parâmetro externo) e produz um
// CoachContext limpo. Testável sem LLM — não depende de nenhum provider.
import { prisma } from '../db';
import { inicioDoDia, getProgressoVendedor } from '../services/metas.service';
import { getTotalXp } from '../gamificacao/ledger.service';
import { calcularNivel } from '../gamificacao/niveis';
import { recomputarBaselines } from '../gamificacao/baseline.service';
import { CoachContext } from './context.types';
import { getMemoria } from './memory.service';
import { getMissaoPrioritariaParaCoach } from '../missoes/service';

/** Vendas necessárias pra bater a meta, dado o ticket médio atual — cálculo determinístico, nunca do LLM. */
function estimarVendasRestantes(amountRemaining: number | null, ticket: number): number | null {
  if (amountRemaining === null || amountRemaining <= 0 || ticket <= 0) return amountRemaining === 0 ? 0 : null;
  return Math.ceil(amountRemaining / ticket);
}

export async function buildCoachContext(vendedorId: string, agora: Date = new Date()): Promise<CoachContext> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({
    where: { id: vendedorId },
    include: { loja: true },
  });

  const [progresso, xpTotal, baselines, streak, badgesRecentes, memoria, ultimoIndicador, missaoPrioritaria] = await Promise.all([
    getProgressoVendedor(vendedorId, agora),
    getTotalXp(vendedorId),
    recomputarBaselines(vendedorId, inicioDoDia(agora)),
    prisma.streakVendedor.findUnique({ where: { vendedorId } }),
    prisma.badgeConcessao.findMany({
      where: { vendedorId },
      include: { badge: true },
      orderBy: { concedidoEm: 'desc' },
      take: 3,
    }),
    getMemoria(vendedorId, agora),
    prisma.indicadorRealizado.findFirst({ where: { vendedorId }, orderBy: { dataHora: 'desc' } }),
    // Só o mínimo necessário (seção 36 da Fatia 7: "não enviar banco inteiro
    // de missões") — título + progresso, nunca critério/recompensa/ID interno.
    getMissaoPrioritariaParaCoach(vendedorId, agora),
  ]);

  const dia = progresso.find((p) => p.periodo === 'DIA')!;
  const baselinePa = baselines.find((b) => b.metrica === 'PA')!;
  const baselineTicket = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;

  const goalPercent = dia.metaFaturamento && dia.metaFaturamento > 0 ? (dia.realizado.faturamento / dia.metaFaturamento) * 100 : null;

  return {
    seller: { displayName: vendedor.nome },
    store: { name: vendedor.loja.nome },
    goal: {
      todayGoal: dia.metaFaturamento,
      realized: dia.realizado.faturamento,
      goalPercent,
      amountRemaining: dia.faltaParaMeta,
      estimatedSalesRemaining: estimarVendasRestantes(dia.faltaParaMeta, dia.realizado.ticketMedio),
    },
    performance: {
      ticket: dia.realizado.ticketMedio,
      pa: dia.realizado.pa,
      salesCount: dia.realizado.numAtendimentos,
    },
    baseline: {
      ticket: baselineTicket.amostraSuficiente ? baselineTicket.valor : null,
      pa: baselinePa.amostraSuficiente ? baselinePa.valor : null,
      status: baselinePa.amostraSuficiente && baselineTicket.amostraSuficiente ? 'disponivel' : 'em_formacao',
    },
    gamification: {
      xp: xpTotal,
      level: calcularNivel(xpTotal).nome,
      streak: streak?.streakAtual ?? 0,
      recentBadges: badgesRecentes.map((b) => b.badge.titulo),
    },
    development: {
      currentFocus: memoria.currentFocus,
      currentMission: missaoPrioritaria ? `${missaoPrioritaria.title} (${missaoPrioritaria.progresso}%)` : null,
      recentTrainings: [], // Academia é Fatia 6
      professionalMemorySummary: memoria.summary,
    },
    freshness: {
      lastDataSyncAt: ultimoIndicador ? ultimoIndicador.dataHora.toISOString() : null,
    },
  };
}
