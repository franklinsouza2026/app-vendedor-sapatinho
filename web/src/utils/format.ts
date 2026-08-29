export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarNumero(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarPercentual(valor: number): string {
  return `${formatarNumero(valor, 1)}%`;
}

export function formatarHora(data: Date): string {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatarDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function saudacao(agora: Date = new Date()): string {
  const hora = agora.getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Tradução pt-BR dos tipoEvento técnicos do ledger — nunca mostrar enum cru na UI. */
const LABEL_EVENTO: Record<string, string> = {
  CHECKIN_DIARIO: 'Check-in diário',
  TREINAMENTO_CONCLUIDO: 'Treinamento concluído',
  QUIZ_APROVADO: 'Quiz aprovado',
  META_DIARIA_100: 'Meta diária atingida',
  META_DIARIA_110: '110% da meta diária',
  META_DIARIA_120: '120% da meta diária',
  META_DIARIA_150: '150% da meta diária',
  MELHORA_PA: 'Melhora no PA',
  MELHORA_TICKET: 'Melhora no ticket médio',
  STREAK_3: 'Sequência de 3 dias',
  STREAK_5: 'Sequência de 5 dias',
  STREAK_10: 'Sequência de 10 dias',
  MISSAO: 'Missão concluída',
  AJUSTE_MANUAL: 'Ajuste manual',
  REVERSAO: 'Ajuste por cancelamento/reversão',
};

export function labelEvento(tipoEvento: string): string {
  return LABEL_EVENTO[tipoEvento] ?? tipoEvento;
}

const LABEL_RANKING: Record<string, string> = {
  FATURAMENTO: 'Faturamento',
  PERCENTUAL_META: '% da Meta',
  PA: 'PA',
  TICKET: 'Ticket',
  EVOLUCAO: 'Evolução',
  MOEDAS: 'Moedas',
  SCORE_GERAL: 'Score Geral',
};

export function labelRanking(tipo: string): string {
  return LABEL_RANKING[tipo] ?? tipo;
}
