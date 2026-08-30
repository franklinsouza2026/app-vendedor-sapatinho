// Formata o CoachContext em texto legível pro system prompt — nunca como
// mensagem "do usuário" (evita confundir contexto com entrada do vendedor,
// e reduz superfície de prompt injection via mistura de canais).
import { CoachContext } from '../context.types';

export function formatarContextoParaPrompt(ctx: CoachContext): string {
  const linhas: string[] = [];

  linhas.push(`CONTEXTO ATUAL (fatos, use apenas o que estiver aqui — nunca invente além disso):`);
  linhas.push(`Vendedor: ${ctx.seller.displayName} — Loja: ${ctx.store.name}`);

  if (ctx.goal.todayGoal !== null) {
    linhas.push(
      `Meta de hoje: R$ ${ctx.goal.todayGoal.toFixed(2)} | Realizado: R$ ${ctx.goal.realized.toFixed(2)} | ` +
        `Atingido: ${ctx.goal.goalPercent?.toFixed(1) ?? '?'}% | Falta: R$ ${ctx.goal.amountRemaining?.toFixed(2) ?? '?'}` +
        (ctx.goal.estimatedSalesRemaining !== null ? ` (~${ctx.goal.estimatedSalesRemaining} vendas no ticket atual)` : '')
    );
  } else {
    linhas.push('Meta de hoje: não cadastrada.');
  }

  linhas.push(`PA hoje: ${ctx.performance.pa.toFixed(2)} | Ticket hoje: R$ ${ctx.performance.ticket.toFixed(2)} | Atendimentos: ${ctx.performance.salesCount}`);

  if (ctx.baseline.status === 'disponivel') {
    linhas.push(`Baseline pessoal — PA: ${ctx.baseline.pa?.toFixed(2)} | Ticket: R$ ${ctx.baseline.ticket?.toFixed(2)}`);
  } else {
    linhas.push('Baseline pessoal: ainda em formação (poucos dias de histórico) — não compare com média ainda.');
  }

  linhas.push(`Gamificação: nível ${ctx.gamification.level} | XP ${ctx.gamification.xp} | sequência ${ctx.gamification.streak} dias`);
  if (ctx.gamification.recentBadges.length > 0) {
    linhas.push(`Conquistas recentes: ${ctx.gamification.recentBadges.join(', ')}`);
  }

  if (ctx.development.professionalMemorySummary) {
    linhas.push(`Resumo de desenvolvimento: ${ctx.development.professionalMemorySummary}`);
  }
  if (ctx.development.currentFocus) {
    linhas.push(`Foco sugerido atual: ${ctx.development.currentFocus}`);
  }
  if (ctx.development.currentMission) {
    linhas.push(`Missão prioritária de hoje: ${ctx.development.currentMission}`);
  }

  linhas.push(
    ctx.freshness.lastDataSyncAt
      ? `Dados sincronizados pela última vez em: ${ctx.freshness.lastDataSyncAt}`
      : 'Ainda sem sincronização de indicadores para este vendedor.'
  );

  return linhas.join('\n');
}
