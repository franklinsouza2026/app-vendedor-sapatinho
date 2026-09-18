// Camada central de apresentação PT-BR (Fatia 9.7, P1).
//
// Regra: enums e IDs continuam em INGLÊS no backend/banco — renomeá-los
// quebraria migrations, integrações e testes sem ganho pro usuário. A tradução
// vive só aqui, na borda de exibição, e sempre com fallback `?? valor` pra que
// um enum novo apareça cru em vez de sumir da tela.
//
// Este arquivo existe pra evitar o que a auditoria encontrou: 21+ pontos
// renderizando enum cru, com dicionários duplicados espalhados por tela.
// Alerta e specialist já tinham dicionário próprio (Fatia 9.6) e continuam
// onde estão — `alertLabels.ts` e `specialistLabels.ts`.

function traduzir(dicionario: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  return dicionario[valor] ?? valor;
}

// --- Conteúdo e publicação ---

const STATUS_CONTEUDO: Record<string, string> = {
  DRAFT: 'Rascunho',
  REVIEW_PENDING: 'Em revisão',
  APPROVED: 'Aprovado',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};
export const labelStatusConteudo = (v?: string | null) => traduzir(STATUS_CONTEUDO, v);

const PUBLICO_CONTEUDO: Record<string, string> = {
  SELLER: 'Vendedores',
  MANAGER: 'Gerentes',
  BOTH: 'Vendedores e gerentes',
};
export const labelPublico = (v?: string | null) => traduzir(PUBLICO_CONTEUDO, v);

// --- Universidade: PDI, competências, evidência ---

// Cobre TODOS os valores de `TipoItemPDI` no schema — faltando um, o vendedor
// lê o enum cru ("MANAGER_ACTION") na etapa do seu próprio plano.
const TIPO_ITEM_PDI: Record<string, string> = {
  LESSON: 'Aula',
  TRACK: 'Trilha',
  SIMULATION: 'Simulação',
  QUIZ: 'Quiz',
  MISSION: 'Missão',
  PRACTICE: 'Prática em loja',
  MANAGER_ACTION: 'Ação com o gerente',
  REVIEW: 'Revisão',
  CERTIFICATION: 'Certificação',
};
export const labelTipoItemPDI = (v?: string | null) => traduzir(TIPO_ITEM_PDI, v);

// Atende DOIS enums do schema — `StatusPDI` (o plano) e `StatusItemPDI` (a
// etapa). Precisa cobrir os dois por inteiro: faltando um valor, o vendedor lê
// o enum cru no próprio plano de desenvolvimento.
const STATUS_PDI: Record<string, string> = {
  // StatusItemPDI
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  SKIPPED: 'Dispensado',
  // StatusPDI
  ACTIVE: 'Ativo',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
  // comum aos dois
  COMPLETED: 'Concluído',
};
export const labelStatusPDI = (v?: string | null) => traduzir(STATUS_PDI, v);

const NIVEL_CONFIANCA: Record<string, string> = {
  LOW: 'baixa',
  MEDIUM: 'média',
  HIGH: 'alta',
};
export const labelConfianca = (v?: string | null) => traduzir(NIVEL_CONFIANCA, v);

const NIVEL_COMPETENCIA: Record<string, string> = {
  INICIANTE: 'Iniciante',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  COMPETENTE: 'Competente',
  AVANCADO: 'Avançado',
  NOT_ENOUGH_DATA: 'Dados insuficientes',
};
export const labelNivelCompetencia = (v?: string | null) => traduzir(NIVEL_COMPETENCIA, v);

// --- Simulador ---

const CATEGORIA_CENARIO: Record<string, string> = {
  GESTAO_DE_PESSOAS: 'Gestão de pessoas',
  ABORDAGEM: 'Abordagem',
  SONDAGEM: 'Sondagem',
  DEMONSTRACAO: 'Demonstração',
  OBJECAO: 'Quebra de objeção',
  FECHAMENTO: 'Fechamento',
  VENDA_COMPLEMENTAR: 'Venda complementar',
  POS_VENDA: 'Pós-venda',
  GERAL: 'Geral',
};
export const labelCategoriaCenario = (v?: string | null) => traduzir(CATEGORIA_CENARIO, v);

// --- Identidade ---

const PAPEL: Record<string, string> = {
  VENDEDOR: 'Vendedor',
  GERENTE: 'Gerente',
  ADMIN: 'Administrador',
};
export const labelPapel = (v?: string | null) => traduzir(PAPEL, v);

const STATUS_CONTA: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING_ACTIVATION: 'Aguardando ativação',
  BLOCKED: 'Bloqueado',
  OFFBOARDED: 'Desligado',
};
export const labelStatusConta = (v?: string | null) => traduzir(STATUS_CONTA, v);

// --- Metas e gamificação ---

const TIPO_META: Record<string, string> = {
  FATURAMENTO: 'Faturamento',
  TICKET_MEDIO: 'Ticket médio',
  PA: 'PA (peças por atendimento)',
};
export const labelTipoMeta = (v?: string | null) => traduzir(TIPO_META, v);

const PERIODO_META: Record<string, string> = {
  DIA: 'Diária',
  SEMANA: 'Semanal',
  MES: 'Mensal',
};
export const labelPeriodoMeta = (v?: string | null) => traduzir(PERIODO_META, v);

// Valores conferidos contra `enum TipoReconhecimento` no schema.
const TIPO_RECONHECIMENTO: Record<string, string> = {
  PERFORMANCE: 'Performance',
  EVOLUTION: 'Evolução',
  LEARNING: 'Aprendizado',
  TEAMWORK: 'Trabalho em equipe',
  CONSISTENCY: 'Consistência',
  LEADERSHIP: 'Liderança',
  CUSTOM: 'Outro',
};
export const labelReconhecimento = (v?: string | null) => traduzir(TIPO_RECONHECIMENTO, v);

// --- Painel gerencial ---

// Valores conferidos contra `enum TipoItemPlanoAcao` no schema.
const TIPO_ITEM_PLANO: Record<string, string> = {
  TALK: 'Conversar',
  OBSERVE: 'Observar atendimento',
  TRAIN: 'Treinar',
  ASSIGN_MISSION: 'Atribuir missão',
  ASSIGN_CONTENT: 'Atribuir conteúdo',
  CREATE_PDI: 'Criar PDI',
  REVIEW_PDI: 'Revisar PDI',
  RECOGNIZE: 'Reconhecer',
  FOLLOW_UP: 'Acompanhar',
  CUSTOM_TEXT: 'Ação livre',
};
export const labelItemPlano = (v?: string | null) => traduzir(TIPO_ITEM_PLANO, v);

// `enum StatusPlanoAcao` / `StatusOneOnOne` / `StatusItemPlanoAcao`.
const STATUS_ACOMPANHAMENTO: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Em andamento',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'Em andamento',
  PENDING: 'Pendente',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};
export const labelStatusAcompanhamento = (v?: string | null) => traduzir(STATUS_ACOMPANHAMENTO, v);

/**
 * Converte um nome de parâmetro em camelCase (ex.: `limiarPercentualDoEsperado`)
 * numa frase legível ("Limiar percentual do esperado"). Usado nos thresholds de
 * alerta do Admin, que são chaves dinâmicas — não dá pra ter dicionário fixo, e
 * a alternativa era continuar mostrando camelCase cru na tela.
 */
export function humanizarChave(chave: string): string {
  const comEspacos = chave.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return comEspacos.charAt(0).toUpperCase() + comEspacos.slice(1);
}

const STATUS_VINCULO_ERP: Record<string, string> = {
  PENDING: 'aguardando verificação',
  VERIFIED: 'verificado',
  FAILED: 'falhou',
  REVOKED: 'revogado',
};
export const labelStatusVinculoErp = (v?: string | null) => traduzir(STATUS_VINCULO_ERP, v);
