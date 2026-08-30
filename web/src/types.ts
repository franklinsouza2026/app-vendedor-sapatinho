export type Papel = 'VENDEDOR' | 'GERENTE' | 'ADMIN';

export interface Loja {
  id: string;
  nome: string;
  codigoErp?: string;
}

export interface VendedorResumo {
  id: string;
  nome: string;
  papel: Papel;
  cpfMascarado?: string | null;
}

export type StatusConta = 'PENDING_ACTIVATION' | 'ACTIVE' | 'BLOCKED' | 'OFFBOARDED';

export interface VendedorAdmin {
  id: string;
  nome: string;
  matriculaErp: string;
  papel: Papel;
  status: StatusConta;
  cpfMascarado: string | null;
  createdAt: string;
  loja: { id: string; nome: string };
}

export interface VendedorAdminDetalhe extends VendedorAdmin {
  identidadesExternas: { provider: 'LINX'; status: 'PENDING' | 'VERIFIED' | 'REJECTED'; matchMethod: string; verifiedAt: string | null }[];
}

export interface SessaoAtual {
  vendedor: VendedorResumo;
  loja: Loja;
  empresa: { nome: string };
}

export interface ProgressoPeriodo {
  periodo: 'DIA' | 'SEMANA' | 'MES';
  metaFaturamento: number | null;
  realizado: { faturamento: number; ticketMedio: number; pa: number; numAtendimentos: number };
  faltaParaMeta: number | null;
}

export interface Nivel {
  versao: number;
  nivel: number;
  nome: string;
  xpAtual: number;
  xpProximoNivel: number | null;
}

export interface Carteira {
  saldoMoedas: number;
  xp: number;
  nivel: Nivel;
}

export interface TransacaoMoeda {
  id: string;
  tipoEvento: string;
  valor: number;
  ocorridoEm: string;
}

export interface Streak {
  streakAtual: number;
  maiorStreak: number;
  ultimaDataContada: string | null;
}

export interface Badge {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  categoria: string;
  concedidoEm: string;
}

export type TipoRanking = 'FATURAMENTO' | 'PERCENTUAL_META' | 'PA' | 'TICKET' | 'EVOLUCAO' | 'MOEDAS' | 'SCORE_GERAL';
export type EscopoRanking = 'LOJA' | 'REDE';

export interface RankingLinha {
  vendedorId: string;
  nomeVendedor: string;
  posicao: number;
  // null quando tipo === 'FATURAMENTO' e a linha não é a do próprio vendedor
  // (Fatia 7.5A, seção 30 — nunca o valor bruto de faturamento alheio).
  valor: string | null;
  gapParaAnterior: number | null;
  provisorio: boolean;
}

export type Mood = 'VERY_GOOD' | 'GOOD' | 'NEUTRAL' | 'NOT_GOOD';

export interface CheckIn {
  id: string;
  mood: Mood;
  dia: string;
}

export type StatusConversa = 'ABERTA' | 'ENCERRADA';

export interface Conversa {
  id: string;
  vendedorId: string;
  status: StatusConversa;
  startedAt: string;
}

export type RoleMensagem = 'USER' | 'ASSISTANT';

export interface MensagemCoach {
  id: string;
  conversationId: string;
  role: RoleMensagem;
  content: string;
  createdAt: string;
}

export interface ErroCoach {
  error: string;
  type?: 'not_found' | 'message_too_long' | 'rate_limited' | 'budget_exceeded' | 'generation_in_progress' | 'provider_unavailable';
}

export type ModoTreinador =
  | 'GERAL'
  | 'ABORDAGEM'
  | 'SONDAGEM'
  | 'DEMONSTRACAO'
  | 'OBJECAO'
  | 'FECHAMENTO'
  | 'VENDA_COMPLEMENTAR'
  | 'PA'
  | 'TICKET'
  | 'POS_VENDA';

export interface ObjecaoComum {
  code: string;
  label: string;
}

export type StatusConversaTreinador = 'ABERTA' | 'ENCERRADA';

export interface ConversaTreinador {
  id: string;
  vendedorId: string;
  status: StatusConversaTreinador;
  startedAt: string;
}

export interface MensagemTreinador {
  id: string;
  conversationId: string;
  role: RoleMensagem;
  content: string;
  mode?: ModoTreinador | null;
  objection?: string | null;
  createdAt: string;
}

// --- Simulador de Atendimento (Fatia 6) ---

export type DificuldadeSimulacao = 'EASY' | 'MEDIUM' | 'HARD';
export type StatusSimulacao = 'CREATED' | 'ACTIVE' | 'COMPLETED' | 'EVALUATION_PENDING' | 'EVALUATED' | 'FAILED';
export type RoleMensagemSimulacao = 'VENDEDOR' | 'CLIENTE';

export interface CenarioSimulador {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  objective: string;
  availableDifficulties: DificuldadeSimulacao[];
}

export interface SessaoSimulador {
  id: string;
  vendedorId: string;
  scenarioId: string;
  difficulty: DificuldadeSimulacao;
  maxTurns: number;
  status: StatusSimulacao;
  turnCount: number;
  reasonEnded?: string | null;
  startedAt: string;
  endedAt?: string | null;
  evaluatedAt?: string | null;
}

export interface MensagemSimulador {
  id: string;
  sessionId: string;
  role: RoleMensagemSimulacao;
  content: string;
  createdAt: string;
}

export interface AvaliacaoSimulador {
  scoreFinal: number;
  scores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  missedOpportunities: string[];
  betterExample: string;
  summary: string;
}

export interface SessaoDetalhadaSimulador {
  sessao: SessaoSimulador;
  mensagens: MensagemSimulador[];
  avaliacao: AvaliacaoSimulador | null;
}

export interface HistoricoSimuladorItem {
  id: string;
  scenarioTitle: string;
  category: string;
  difficulty: DificuldadeSimulacao;
  status: StatusSimulacao;
  startedAt: string;
  scoreFinal: number | null;
}

export interface EnviarMensagemSimuladorResultado {
  mensagem: MensagemSimulador;
  sessao: SessaoSimulador;
}

export interface ErroSimulador {
  error: string;
  type?: 'not_found' | 'message_too_long' | 'rate_limited' | 'budget_exceeded' | 'generation_in_progress' | 'invalid_state' | 'provider_unavailable';
}

// --- Academia de Vendas (Fatia 6) ---

export type StatusProgressoAcademia = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface AulaResumo {
  id: string;
  code: string;
  title: string;
  estimatedMinutes: number;
  hasQuiz: boolean;
  status: StatusProgressoAcademia;
}

export interface TrilhaResumo {
  id: string;
  code: string;
  title: string;
  description: string;
  aulas: AulaResumo[];
}

export interface PlaybookSecaoResumo {
  category: string;
  title: string;
  content: string;
  origin: 'OFICIAL' | 'DEMONSTRATIVO';
}

export interface AulaDetalhada {
  id: string;
  code: string;
  title: string;
  description: string;
  content: string;
  origem: 'OFICIAL' | 'DEMONSTRATIVO';
  estimatedMinutes: number;
  hasQuiz: boolean;
  quizPassingScore: number | null;
  status: StatusProgressoAcademia;
  playbookRelacionado: PlaybookSecaoResumo[];
}

export interface QuizPergunta {
  id: string;
  question: string;
  opcoes: { id: string; text: string }[];
}

export interface QuizParaResponder {
  id: string;
  passingScore: number;
  perguntas: QuizPergunta[];
}

export interface ResultadoQuiz {
  score: number;
  passingScore: number;
  passed: boolean;
}

export interface ProgressoTrilha {
  id: string;
  title: string;
  totalAulas: number;
  aulasConcluidas: number;
  percentual: number;
}

export interface ProgressoGeral {
  trilhas: ProgressoTrilha[];
  totalAulas: number;
  totalConcluidas: number;
  percentualGeral: number;
}

export interface ErroAcademia {
  error: string;
  type?: 'not_found' | 'quiz_obrigatorio';
}

// --- Missões e Desafios (Fatia 7) ---

export type StatusMissao = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type CategoriaMissao = 'PERFORMANCE' | 'LEARNING' | 'SIMULATION' | 'CONSISTENCY';
export type TipoAcaoMissao = 'COACH' | 'TRAINER' | 'SIMULATOR' | 'ACADEMY' | 'PERFORMANCE';

export interface DefinicaoMissao {
  code: string;
  title: string;
  description?: string;
  category: CategoriaMissao;
  actionType: TipoAcaoMissao;
  actionReference: Record<string, string> | null;
}

export interface Missao {
  id: string;
  status: StatusMissao;
  progressoAtual: number;
  progressoAlvo: number;
  startsAt: string;
  expiresAt: string;
  completedAt: string | null;
  missao: DefinicaoMissao;
}

export interface DefinicaoDesafio {
  code: string;
  title: string;
  description?: string;
}

export interface Desafio {
  id: string;
  status: StatusMissao;
  progressoAtual: number;
  progressoAlvo: number;
  startsAt: string;
  expiresAt: string;
  completedAt: string | null;
  desafio: DefinicaoDesafio;
}

export interface ErroMissao {
  error: string;
  type?: 'not_found';
}
