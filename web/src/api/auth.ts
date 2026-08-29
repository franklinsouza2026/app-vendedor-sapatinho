import { apiFetch } from './client';
import { Loja, SessaoAtual } from '../types';

export function listarLojas() {
  return apiFetch<{ lojas: Loja[] }>('/lojas');
}

export function login(codigoErpLoja: string, matriculaErp: string, senha: string) {
  return apiFetch<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ codigoErpLoja, matriculaErp, senha }),
  });
}

export function buscarSessaoAtual() {
  return apiFetch<SessaoAtual>('/auth/me');
}
