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
  valor: string;
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
