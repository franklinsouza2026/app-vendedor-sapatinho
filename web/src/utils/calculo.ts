// Cálculos determinísticos de EXIBIÇÃO (não regra de negócio versionada como
// XP/moeda/score, que vivem no backend) — seção 3 da fonte de verdade: "meta
// inteligente" deve vir de cálculo determinístico, nunca de LLM.

/** "Faltam R$X, ~N vendas no seu ticket atual." Null se não houver dado suficiente. */
export function vendasNecessarias(faltaParaMeta: number, ticketMedio: number): number | null {
  if (ticketMedio <= 0) return null;
  return Math.ceil(faltaParaMeta / ticketMedio);
}

/**
 * Dias corridos restantes até o fim do período (inclusive hoje). Usamos "dias
 * corridos", não "dias úteis" — não há cadastro de escala/expediente ainda
 * (mesma cautela do backend em streak.service.ts: nunca inferir presença sem
 * fonte confiável), então essa é uma aproximação explícita, não uma promessa.
 */
export function diasRestantesNoPeriodo(periodo: 'SEMANA' | 'MES', hoje: Date = new Date()): number {
  if (periodo === 'SEMANA') {
    return 7 - hoje.getDay(); // hoje conta como 1 dos restantes; sábado = getDay() 6 -> 1 dia restante
  }
  const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return ultimoDiaDoMes - hoje.getDate() + 1;
}

/** Ritmo necessário por dia pra bater a meta do período. Null se já não houver dias restantes. */
export function ritmoNecessario(faltaParaMeta: number, periodo: 'SEMANA' | 'MES', hoje: Date = new Date()): number | null {
  const dias = diasRestantesNoPeriodo(periodo, hoje);
  if (dias <= 0) return null;
  return faltaParaMeta / dias;
}
