/**
 * Cliente da central do Admin (Fase 1). Toda escrita é uma chamada de API
 * validada, escopada à empresa do token e auditada no servidor — a tela nunca
 * edita estado local como fonte de verdade.
 */
import { apiFetch } from '../../api/client';
import type { CampanhaCad, CompeticaoCad, EstadoAdmin, MissaoCad, Premio, Produto } from './tiposAdmin';
import type { Metrica } from '../dominio/tipos';

const json = (method: string, corpo?: unknown): RequestInit => ({ method, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });

export const buscarEstado = () => apiFetch<EstadoAdmin>('/admin/fase1/estado');

// metas e dias previstos (D6/D10)
export const salvarMetaVendedor = (mes: string, vendedorId: string, dados: { mensal: number | null; diasPrevistos: number | null }) => apiFetch(`/admin/fase1/metas/${mes}/vendedores/${vendedorId}`, json('PUT', dados));
export const salvarMetaLoja = (mes: string, lojaId: string, valor: number | null) => apiFetch(`/admin/fase1/metas/${mes}/lojas/${lojaId}`, json('PUT', { valor }));

// configuração (rankings, indicadores, feed)
export interface ConfigFase1Entrada {
  metricasRanking: Metrica[];
  metricaCorrida: Metrica;
  lojaXLoja: { ativo: boolean; formula: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA' | null; lojas: string[] };
  indicadores: Record<string, boolean>;
  feedTipos: Record<string, boolean>;
}
export const salvarConfig = (c: ConfigFase1Entrada) => apiFetch('/admin/fase1/config', json('PUT', c));
export function configDoEstado(e: EstadoAdmin): ConfigFase1Entrada {
  return {
    metricasRanking: e.rankings.metricasAtivas,
    metricaCorrida: e.rankings.metricaCorrida,
    lojaXLoja: { ativo: e.rankings.lojaXLoja.status === 'ATIVO', formula: e.rankings.lojaXLoja.formula, lojas: e.rankings.lojaXLoja.lojas },
    indicadores: Object.fromEntries(Object.entries(e.indicadores).map(([k, v]) => [k, v.ativo])),
    feedTipos: { ...e.feedTipos },
  };
}

// pessoas
export const definirElegibilidade = (vendedorId: string, elegivel: boolean, motivo: string | null) => apiFetch(`/admin/fase1/vendedores/${vendedorId}/elegibilidade`, json('PUT', { elegivel, motivo }));
export const lancarAjuste = (dados: { vendedorId: string; xp: number; moedas: number; motivo: string; chave: string }) => apiFetch<{ lancado: boolean; duplicado: boolean }>('/admin/fase1/ajustes', json('POST', dados));
export const reconhecer = (dados: { vendedorId: string; motivo: string; titulo: string; mensagem: string }) => apiFetch('/admin/fase1/reconhecimentos', json('POST', dados));

// catálogo
export const criarProduto = (p: { referencia: string; nome: string; categoria: string; preco: number; foto?: string | null }) => apiFetch<Produto>('/admin/fase1/produtos', json('POST', p));
export const criarPremio = (p: { nome: string; tipo: 'DIGITAL' | 'EMPRESARIAL'; xp: number; moedas: number; comBadge: boolean; categoria: string | null; descricao: string }) => apiFetch<Premio>('/admin/fase1/premios', json('POST', p));

// missões governadas
export type MissaoEntrada = Omit<MissaoCad, 'id' | 'status'>;
export const validarMissao = (m: MissaoEntrada) => apiFetch<{ itens: { ok: boolean; rotulo: string; problema?: string }[] }>('/admin/fase1/missoes/validar', json('POST', m));
export const criarMissao = (m: MissaoEntrada) => apiFetch<MissaoCad>('/admin/fase1/missoes', json('POST', m));
export const atualizarMissao = (id: string, m: MissaoEntrada) => apiFetch<MissaoCad>(`/admin/fase1/missoes/${id}`, json('PUT', m));
export const acaoMissao = (id: string, acao: 'publicar' | 'encerrar' | 'cancelar' | 'arquivar' | 'duplicar', motivo?: string) => apiFetch<MissaoCad>(`/admin/fase1/missoes/${id}/${acao}`, json('POST', { motivo }));

// competições
export type CompeticaoEntrada = Omit<CompeticaoCad, 'id' | 'status' | 'classificacao' | 'unidade'>;
export const criarCompeticao = (c: CompeticaoEntrada) => apiFetch<CompeticaoCad>('/admin/fase1/competicoes', json('POST', c));
export const acaoCompeticao = (id: string, acao: 'encerrar' | 'cancelar' | 'arquivar', motivo?: string) => apiFetch(`/admin/fase1/competicoes/${id}/${acao}`, json('POST', { motivo }));

// campanhas
export type CampanhaEntrada = Omit<CampanhaCad, 'id' | 'status' | 'resultado'>;
export const validarCampanha = (c: CampanhaEntrada) => apiFetch<{ itens: { ok: boolean; rotulo: string; problema?: string }[] }>('/admin/fase1/campanhas/validar', json('POST', c));
export const criarCampanha = (c: CampanhaEntrada) => apiFetch<CampanhaCad>('/admin/fase1/campanhas', json('POST', c));
export const atualizarCampanha = (id: string, c: CampanhaEntrada) => apiFetch<CampanhaCad>(`/admin/fase1/campanhas/${id}`, json('PUT', c));
export const acaoCampanha = (id: string, acao: 'publicar' | 'encerrar' | 'cancelar' | 'arquivar' | 'duplicar', motivo?: string) => apiFetch<CampanhaCad>(`/admin/fase1/campanhas/${id}/${acao}`, json('POST', { motivo }));

// integrações e saúde
export interface IntegracaoAdmin {
  id: string;
  provedor: 'LINX' | 'MOCK' | 'CONTROLADO';
  status: 'CONFIGURANDO' | 'ATIVA' | 'DESATIVADA';
  configuracao: { urlBase?: string; observacao?: string; portal?: number; backfillDesde?: string };
  credencial: string | null;
  credencialDefinida: boolean;
  credencialAtualizadaEm: string | null;
  ultimaSyncEm: string | null;
  ultimaSyncSucessoEm: string | null;
  ultimaVendaEm: string | null;
  lojas: { lojaId: string; codigoExterno: string }[];
}
export type EstadoSaude = 'OPERACIONAL' | 'ATENCAO' | 'FALHA';
export interface Saude {
  geral: { estado: EstadoSaude; motivo: string };
  worker: { estado: EstadoSaude; motivo: string; ultimoEm: string | null };
  fila: { estado: EstadoSaude; motivo: string; aguardando?: number; falhas?: number };
  integracoes: (IntegracaoAdmin & { estado: EstadoSaude; motivo: string; lojasVinculadas: { lojaId: string; codigoExterno: string; nome: string }[]; execucoes: { id: string; tipo: 'SYNC' | 'RECONCILIACAO'; iniciadaEm: string; finalizadaEm: string | null; status: string; eventosRecebidos: number; vendasNovas: number; ajustesNovos: number; cancelamentos: number; devolucoes: number; pendentes: number; paginas: number; ignorados: number; erro: string | null }[]; errosUltimas24h: number; naoConfigurada: boolean; cursores: { metodo: string; escopo: string; fase: 'BACKFILL' | 'CATCH_UP' | 'LIVE'; valor: string; ultimoAvancoEm: string | null }[]; minutosDesdeUltimoAvanco: number | null; ajustesPendentes: number })[];
  ultimaVendaEm: string | null;
  ultimaSyncSucessoEm: string | null;
  lojasSemVinculo: string[];
}
export const buscarSaude = () => apiFetch<Saude>('/admin/fase1/saude');
export const listarIntegracoes = () => apiFetch<{ integracoes: IntegracaoAdmin[] }>('/admin/fase1/integracoes');
export const criarIntegracao = (provedor: IntegracaoAdmin['provedor'], configuracao: IntegracaoAdmin['configuracao']) => apiFetch<IntegracaoAdmin>('/admin/fase1/integracoes', json('POST', { provedor, configuracao }));
export const atualizarIntegracao = (id: string, configuracao: IntegracaoAdmin['configuracao']) => apiFetch<IntegracaoAdmin>(`/admin/fase1/integracoes/${id}`, json('PATCH', { configuracao }));
export const definirCredencial = (id: string, credencial: string) => apiFetch<IntegracaoAdmin>(`/admin/fase1/integracoes/${id}/credencial`, json('PUT', { credencial }));
export const statusIntegracao = (id: string, status: 'ATIVA' | 'DESATIVADA') => apiFetch<IntegracaoAdmin>(`/admin/fase1/integracoes/${id}/status`, json('POST', { status }));
export const vincularLoja = (id: string, lojaId: string, codigoExterno: string) => apiFetch<IntegracaoAdmin>(`/admin/fase1/integracoes/${id}/lojas/${lojaId}`, json('PUT', { codigoExterno }));
export const desvincularLoja = (id: string, lojaId: string) => apiFetch<IntegracaoAdmin>(`/admin/fase1/integracoes/${id}/lojas/${lojaId}`, json('DELETE'));
export const testarIntegracao = (id: string) => apiFetch<{ ok: boolean; mensagem: string }>(`/admin/fase1/integracoes/${id}/testar`, json('POST'));
export const sincronizarAgora = (id: string) => apiFetch<{ solicitado: boolean }>(`/admin/fase1/integracoes/${id}/sincronizar`, json('POST'));
