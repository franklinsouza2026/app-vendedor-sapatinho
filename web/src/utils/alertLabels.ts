// Labels PT-BR dos alertas gerenciais (Fatia 9.6, seção 51) — só tradução
// de exibição, os IDs internos (`TipoAlertaGerencial`) continuam em inglês
// no backend/DB. Linguagem sempre profissional e não-punitiva (nunca
// "vendedor ruim"/"vendedor parado" — classifica a SITUAÇÃO, nunca a pessoa).
export const NOME_ALERTA: Record<string, string> = {
  LOW_GOAL_ATTAINMENT: 'Atingimento de meta abaixo do esperado',
  PA_BELOW_BASELINE: 'PA abaixo da referência',
  TICKET_BELOW_BASELINE: 'Ticket médio abaixo da referência',
  CONSISTENCY_DROP: 'Queda de consistência',
  NO_SALES_RECENTLY: 'Sem venda registrada recentemente',
  MISSION_STALLED: 'Missão sem evolução',
  TRAINING_OVERDUE: 'Treinamento pendente',
  CERTIFICATION_EXPIRING: 'Certificação próxima do vencimento',
  PDI_STALLED: 'PDI sem evolução',
  COMPETENCY_GAP: 'Oportunidade de desenvolvimento de competência',
  NO_RECENT_MANAGER_FOLLOWUP: 'Acompanhamento gerencial pendente',
};

export function labelAlerta(tipo: string): string {
  return NOME_ALERTA[tipo] ?? tipo;
}
