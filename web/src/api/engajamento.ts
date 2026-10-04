import { apiFetch } from './client';

// Engajamento — acesso diário (check-in), painel do Admin e configuração.
// O cliente NUNCA envia data, valor nem "primeiro acesso": só avisa que o
// app foi aberto; o servidor decide tudo.

export interface RecompensaAcesso {
  xp: number;
  moedas: number;
}

export interface ConfigRecompensaAcesso {
  ativo: boolean;
  xp: number;
  moedas: number;
}

export interface ResultadoAcesso {
  dia: string;
  primeiroAcessoDoDia: boolean;
  recompensaAgora: RecompensaAcesso | null;
  checkinConcluido: boolean;
  recompensaHoje: RecompensaAcesso | null;
  quantidadeAcessosHoje: number;
  streakAcesso: number;
  config: ConfigRecompensaAcesso;
}

export interface Frequencia {
  diasComAcesso: number;
  diasValidos: number;
  percentual: number | null;
}

export interface MeuEngajamento {
  hoje: string;
  acessouHoje: boolean;
  recompensaHoje: RecompensaAcesso | null;
  config: ConfigRecompensaAcesso;
  streakAtual: number;
  maiorStreak: number;
  semana: Frequencia;
}

export type TipoEventoEngajamento = 'MISSAO_CONCLUIDA' | 'DESAFIO_CONCLUIDO' | 'AULA_CONCLUIDA' | 'QUIZ_APROVADO' | 'SIMULACAO_CONCLUIDA';

export interface LinhaEngajamento {
  vendedorId: string;
  nome: string;
  lojaId: string;
  loja: string;
  acessouHoje: boolean;
  semana: Frequencia;
  periodo: Frequencia;
  streakAtual: number;
  ultimoAcessoEm: string | null;
  engajamento: Record<TipoEventoEngajamento, number>;
}

export type PeriodoEngajamento = 'HOJE' | 'SEMANA_ATUAL' | 'ULTIMOS_7' | 'SEMANA_PASSADA' | 'ULTIMOS_30' | 'PERSONALIZADO';

export interface PainelEngajamento {
  hoje: string;
  timezone: string;
  periodo: { tipo: PeriodoEngajamento; inicio: string; fim: string };
  kpis: {
    hoje: { acessaram: number; elegiveis: number; percentual: number | null; naoAcessaram: number; recompensasConcedidas: number };
    periodo: { acessaram: number; elegiveis: number; percentual: number | null; semAcesso: number; mediaDiasComAcesso: number; mediaDiasValidos: number; distribuicao: { dias: number; vendedores: number }[] };
    maiorStreak: { dias: number; vendedor: string } | null;
  };
  serie: { dia: string; acessaram: number; elegiveis: number }[];
  porLoja: { lojaId: string; loja: string; elegiveis: number; acessaramHoje: number; diasComAcesso: number; diasValidos: number; percentualPeriodo: number | null }[];
  vendedores: LinhaEngajamento[];
}

export function registrarAcesso() {
  return apiFetch<ResultadoAcesso>('/engajamento/acesso', { method: 'POST' });
}

export function buscarMeuEngajamento() {
  return apiFetch<MeuEngajamento>('/engajamento/meu');
}

export function buscarPainelEngajamento(filtros: { periodo: PeriodoEngajamento; de?: string; ate?: string; lojaId?: string }) {
  const q = new URLSearchParams({ periodo: filtros.periodo });
  if (filtros.de) q.set('de', filtros.de);
  if (filtros.ate) q.set('ate', filtros.ate);
  if (filtros.lojaId) q.set('lojaId', filtros.lojaId);
  return apiFetch<PainelEngajamento>(`/engajamento/painel?${q.toString()}`);
}

export function buscarConfigRecompensa() {
  return apiFetch<ConfigRecompensaAcesso>('/admin/engajamento/config');
}

export function salvarConfigRecompensa(config: ConfigRecompensaAcesso) {
  return apiFetch<ConfigRecompensaAcesso>('/admin/engajamento/config', { method: 'PUT', body: JSON.stringify(config) });
}

export interface ItemGanho {
  chave: string;
  tipoEvento: string;
  referenciaTipo: string | null;
  ocorridoEm: string;
  xp: number;
  moedas: number;
}

export function buscarMeusGanhos() {
  return apiFetch<{ itens: ItemGanho[] }>('/gamificacao/meus-ganhos');
}
