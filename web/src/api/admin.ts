import { apiFetch } from './client';
import { Papel, StatusConta, VendedorAdmin, VendedorAdminDetalhe } from '../types';

export function listarVendedoresAdmin(filtros: { status?: StatusConta; papel?: Papel; busca?: string } = {}) {
  const params = new URLSearchParams();
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.papel) params.set('papel', filtros.papel);
  if (filtros.busca) params.set('busca', filtros.busca);
  const query = params.toString();
  return apiFetch<{ vendedores: VendedorAdmin[] }>(`/admin/vendedores${query ? `?${query}` : ''}`);
}

export function detalharVendedorAdmin(id: string) {
  return apiFetch<VendedorAdminDetalhe>(`/admin/vendedores/${id}`);
}

export function preAutorizarVendedor(dados: { lojaId: string; matriculaErp: string; nome: string; cpf: string; papel?: Papel }) {
  return apiFetch<{ id: string; nome: string; status: StatusConta; tokenAtivacao: string; expiraEm: string }>('/admin/vendedores', {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

function transicao(id: string, acao: 'bloquear' | 'desbloquear' | 'desligar' | 'reativar') {
  return apiFetch<{ id: string; statusAnterior: StatusConta; statusNovo: StatusConta }>(`/admin/vendedores/${id}/${acao}`, { method: 'POST' });
}

export const bloquearVendedor = (id: string) => transicao(id, 'bloquear');
export const desbloquearVendedor = (id: string) => transicao(id, 'desbloquear');
export const desligarVendedor = (id: string) => transicao(id, 'desligar');
export const reativarVendedor = (id: string) => transicao(id, 'reativar');

export function realocarVendedor(id: string, novaLojaId: string) {
  return apiFetch<{ id: string; lojaAnteriorId: string; lojaNovaId: string }>(`/admin/vendedores/${id}/realocar`, {
    method: 'POST',
    body: JSON.stringify({ novaLojaId }),
  });
}

export interface PessoaEstrutura {
  id: string;
  nome: string;
  status: StatusConta;
}

export interface LinhaEstrutura {
  loja: { id: string; nome: string; codigoErp: string; ativa: boolean };
  gerentes: PessoaEstrutura[];
  vendedores: PessoaEstrutura[];
}

export function buscarEstruturaDaEmpresa() {
  return apiFetch<{ estrutura: LinhaEstrutura[] }>('/admin/estrutura');
}

// --- Reemissão de acesso (Fatia 9.7) ---
// O Admin nunca define a senha: recebe um token de uso único pra repassar, e
// o próprio usuário escolhe a senha na tela de ativação.
export function reemitirAcesso(id: string) {
  return apiFetch<{ tokenAtivacao: string; expiraEm: string }>(`/admin/vendedores/${id}/reemitir-acesso`, { method: 'POST' });
}

// --- Gestão de lojas (Fatia 9.7) ---

export interface LojaAdmin {
  id: string;
  nome: string;
  codigoErp: string;
  ativa: boolean;
  gerentes: number;
  vendedores: number;
}

export function listarLojasAdmin() {
  return apiFetch<{ lojas: LojaAdmin[] }>('/admin/lojas');
}

export function criarLoja(dados: { nome: string; codigoErp: string }) {
  return apiFetch<LojaAdmin>('/admin/lojas', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarLoja(id: string, dados: { nome?: string; codigoErp?: string }) {
  return apiFetch<LojaAdmin>(`/admin/lojas/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function inativarLoja(id: string) {
  return apiFetch<LojaAdmin>(`/admin/lojas/${id}/inativar`, { method: 'POST' });
}

export function reativarLoja(id: string) {
  return apiFetch<LojaAdmin>(`/admin/lojas/${id}/reativar`, { method: 'POST' });
}

// --- Gestão de metas (Fatia 9.7) ---

export type TipoMeta = 'FATURAMENTO' | 'TICKET_MEDIO' | 'PA';
export type PeriodoMeta = 'DIA' | 'SEMANA' | 'MES';

export interface MetaAdmin {
  id: string;
  vendedorId: string;
  vendedorNome: string;
  matriculaErp: string;
  lojaId: string;
  tipo: TipoMeta;
  periodo: PeriodoMeta;
  referencia: string;
  valorMeta: number;
  /** false quando o período já encerrou — histórico é imutável. */
  editavel: boolean;
}

export function listarMetasAdmin(filtros: { lojaId?: string; vendedorId?: string; periodo?: PeriodoMeta } = {}) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) if (valor) params.set(chave, valor);
  const query = params.toString();
  return apiFetch<{ metas: MetaAdmin[] }>(`/admin/metas${query ? `?${query}` : ''}`);
}

export function criarMetaAdmin(dados: { vendedorId: string; tipo: TipoMeta; periodo: PeriodoMeta; referencia: string; valorMeta: number }) {
  return apiFetch<{ id: string }>('/admin/metas', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarMetaAdmin(id: string, valorMeta: number) {
  return apiFetch<{ id: string }>(`/admin/metas/${id}`, { method: 'PUT', body: JSON.stringify({ valorMeta }) });
}

export function removerMetaAdmin(id: string) {
  return apiFetch<void>(`/admin/metas/${id}`, { method: 'DELETE' });
}
