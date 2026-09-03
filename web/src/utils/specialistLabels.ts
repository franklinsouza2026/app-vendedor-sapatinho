// Labels PT-BR dos specialists de IA (Fatia 9.6, seção 52) — só tradução de
// exibição na Central de IA; os IDs internos (`EspecialistaIA`) continuam em
// inglês no backend/DB/AIUsage.
export const NOME_ESPECIALISTA: Record<string, string> = {
  COACH: 'Conselheiro',
  TRAINER: 'Treinador',
  SIMULATOR: 'Simulador',
  ADMIN_AI_TEST: 'Teste de conexão (Admin)',
  RESEARCH_AGENT: 'Agente de Pesquisa',
  CURATOR_AGENT: 'Agente Curador',
  INSTRUCTIONAL_DESIGNER: 'Designer Instrucional',
  QUIZ_AGENT: 'Especialista em Quiz',
  SIMULATION_DESIGNER: 'Designer de Simulações',
  GOVERNANCE_AGENT: 'Governança e Qualidade',
  CONTENT_UPDATE_AGENT: 'Atualização de Conteúdo',
  SELLER_TRAINING_AGENT: 'Treinador de Vendedores',
  MANAGER_TRAINING_AGENT: 'Treinador de Gerentes',
  MANAGER_ADVISOR: 'Assistente de Gestão',
};

export function labelEspecialista(especialista: string): string {
  return NOME_ESPECIALISTA[especialista] ?? especialista;
}
