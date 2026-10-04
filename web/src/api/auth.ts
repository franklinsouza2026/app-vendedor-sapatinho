import { apiFetch } from './client';
import { Loja, SessaoAtual } from '../types';

/** Empresa deste app (build por empresa). Com uma única empresa no servidor, pode ficar vazio. */
const EMPRESA_DO_APP = import.meta.env.VITE_EMPRESA_ID as string | undefined;

export function listarLojas() {
  return apiFetch<{ lojas: Loja[] }>(EMPRESA_DO_APP ? `/lojas?empresa=${encodeURIComponent(EMPRESA_DO_APP)}` : '/lojas');
}

/** Login pela loja (UUID) — nunca pelo código ERP, que pode se repetir entre empresas. */
export function login(lojaId: string, matriculaErp: string, senha: string) {
  return apiFetch<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ lojaId, matriculaErp, senha }),
  });
}

export function buscarSessaoAtual() {
  return apiFetch<SessaoAtual>('/auth/me');
}

export function ativarConta(dados: { lojaId: string; cpf: string; token: string; senha: string }) {
  return apiFetch<{ token: string; vendedor: { id: string; nome: string; papel: string } }>('/auth/ativacao', {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

export function alterarSenha(senhaAtual: string, novaSenha: string) {
  return apiFetch<void>('/auth/senha', { method: 'POST', body: JSON.stringify({ senhaAtual, novaSenha }) });
}
