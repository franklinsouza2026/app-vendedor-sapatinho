/**
 * Estado da central do Admin como o SERVIDOR entrega (GET /admin/fase1/estado).
 * Nada aqui é calculado no navegador que decida meta, posição, prêmio ou
 * recompensa — a tela apresenta e aciona endpoints validados e auditados.
 */
import type { Metrica, TipoMissao } from '../dominio/tipos';

export type StatusVendedor = 'ATIVO' | 'PENDENTE' | 'BLOQUEADO' | 'DESLIGADO';
export type MotivoInelegivel = 'NOVO' | 'DESLIGADO' | 'TRANSFERIDO' | 'PERIODO_INSUFICIENTE' | 'EXCECAO';
export type StatusCiclo = 'RASCUNHO' | 'PROGRAMADA' | 'ATIVA' | 'ENCERRADA' | 'ARQUIVADA' | 'CANCELADA';
export type Indicador = 'VENDAS' | 'QTD_VENDAS' | 'PARES' | 'TICKET' | 'PA' | 'PERCENTUAL_META' | 'SCORE' | 'EVOLUCAO' | 'CONSISTENCIA' | 'CONVERSAO';
export type TipoFeed = 'POSICAO' | 'META' | 'RECORDE' | 'MISSAO' | 'CONQUISTA' | 'LOJA' | 'COMPETICAO' | 'RECONHECIMENTO';
export type MotivoReconhecimento = 'RESULTADO' | 'EVOLUCAO' | 'INICIATIVA' | 'EQUIPE' | 'SUPERACAO' | 'OUTRO';

export interface VendedorCad {
  id: string;
  nome: string;
  lojaId: string;
  matricula: string;
  status: StatusVendedor;
  admitidoEm: string;
  vinculoErp: 'VERIFICADO' | 'PENDENTE';
  elegivel: boolean;
  motivoInelegivel: MotivoInelegivel | null;
  excecao: string | null;
}

export interface LojaCad {
  id: string;
  nome: string;
  codigo: string;
  status: 'ATIVA' | 'INATIVA';
  ultimaSync: string | null;
  metaMes: number | null;
}

export interface MetaIndividual {
  mensal: number | null;
  diasPrevistos: number | null;
  diaria: number | null;
}

export interface ConfigIndicador {
  ativo: boolean;
  fonte: 'CONFIAVEL' | 'PARCIAL' | 'SEM_FONTE';
  nota: string;
}

export interface Produto {
  id: string;
  referencia: string;
  nome: string;
  categoria: string;
  preco: number;
  foto: string | null;
  ativo: boolean;
}

export interface MissaoCad {
  id: string;
  nome: string;
  tipo: TipoMissao;
  template: string | null;
  descricao: string;
  unidade: 'venda' | 'par' | 'dia' | 'reais';
  alvo: number;
  xp: number;
  moedas: number;
  premioId: string | null;
  lojas: 'TODAS' | string[];
  inicio: string;
  fim: string;
  status: StatusCiclo;
  produtos: string[];
  regras: string;
  parametros: Record<string, unknown>;
}

export interface LinhaClassificacao {
  id: string;
  nome: string;
  valor: number | null;
  posicao: number;
  grupo: string | null;
}

export interface CompeticaoCad {
  id: string;
  nome: string;
  tipo: 'VENDEDOR' | 'LOJA' | 'EVOLUCAO' | 'CATEGORIA';
  formato: 'MENSAL' | 'SEMANAL' | 'ESPECIAL';
  metrica: 'PERCENTUAL_META' | 'EVOLUCAO' | 'SCORE' | 'PA' | 'TICKET' | 'QTD_VENDAS' | 'PARES_CATEGORIA' | null;
  categoria: string | null;
  unidade: 'vendas' | 'pares' | 'pontos' | 'percentual' | 'pp';
  escopo: 'MINHA_LOJA' | 'TODAS';
  lojas: 'TODAS' | string[];
  regra: string;
  inicio: string;
  fim: string;
  status: StatusCiclo;
  premioIds: string[];
  classificacao: LinhaClassificacao[];
}

export interface FrenteCampanha {
  id: string;
  icone: string;
  titulo: string;
  mecanismo: 'COMPETICAO' | 'META_MES' | 'MISSAO';
  refId: string | null;
  premioId: string | null;
}

export interface CampanhaCad {
  id: string;
  nome: string;
  descricao: string;
  objetivo: string;
  inicio: string;
  fim: string;
  status: StatusCiclo;
  lojas: 'TODAS' | string[];
  frentes: FrenteCampanha[];
  regras: string;
  resultado: { frenteId: string; vencedor: string; premio: string; minhaPosicao: number | null }[] | null;
}

export interface Premio {
  id: string;
  nome: string;
  tipo: 'DIGITAL' | 'EMPRESARIAL';
  xp: number;
  moedas: number;
  badge: string | null;
  categoria: 'DINHEIRO' | 'VALE' | 'PRODUTO' | 'EXPERIENCIA' | 'OUTRO' | null;
  descricao: string;
}

export interface ReconhecimentoCad {
  id: string;
  vendedorId: string;
  motivo: MotivoReconhecimento;
  titulo: string;
  mensagem: string;
  quando: string;
  autor: string;
}

export interface EventoAuditoria {
  id: string;
  quando: string;
  usuario: string;
  acao: string;
  entidade: string;
  antes: string | null;
  depois: string | null;
  motivo: string | null;
}

export interface NivelInfo {
  nivel: number;
  nome: string;
  proximo: { nivel: number; nome: string; xpMinimo: number } | null;
  faltaXp: number | null;
}

export interface DesempenhoVendedor {
  vendedorId: string;
  mes: { faturamento: number; vendas: number; pares: number; percentualMeta: number | null };
  hoje: { faturamento: number; vendas: number };
  metaDiaria: number | null;
  ticket: number | null;
  pa: number | null;
  score: number | null;
  acessosNoMes: number;
  posicaoLoja: number | null;
  posicaoGeral: number | null;
  xp: number;
  moedas: number;
  nivel: NivelInfo;
}

export interface Movimento {
  id: string;
  quando: string;
  origem: string;
  vendedor: string;
  xp?: number;
  valor?: number;
}

export interface EstadoAdmin {
  agora: string;
  empresa: { id: string; nome: string; timezone: string };
  mes: string;
  vendedores: VendedorCad[];
  lojas: LojaCad[];
  metas: { referencia: string; individuais: Record<string, MetaIndividual> };
  indicadores: Record<Indicador, ConfigIndicador>;
  rankings: { metricasAtivas: Metrica[]; metricaCorrida: Metrica; lojaXLoja: { status: 'AGUARDANDO_REGRA' | 'ATIVO'; formula: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA' | null; lojas: string[] } };
  feedTipos: Record<TipoFeed, boolean>;
  produtos: Produto[];
  missoes: MissaoCad[];
  competicoes: CompeticaoCad[];
  campanhas: CampanhaCad[];
  premios: Premio[];
  reconhecimentos: ReconhecimentoCad[];
  auditoria: EventoAuditoria[];
  desempenho: DesempenhoVendedor[];
  feedRecente: { id: string; eventType: string; quando: string; texto: string; lojaId: string | null }[];
  lojaXLoja: { lojaId: string; posicao: number; pontos: number; posicaoAnterior: number | null; distanciaAcima: number | null }[];
  gamificacao: {
    regua: { versao: number; xp: Record<string, number>; moedas: Record<string, number> };
    niveis: { nivel: number; nome: string; xpMinimo: number }[];
    movimentacoesXp: Movimento[];
    movimentacoesMoedas: Movimento[];
    conquistas: { codigo: string; titulo: string; descricao: string; conquistaram: number }[];
  };
}
