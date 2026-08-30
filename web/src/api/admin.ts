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
