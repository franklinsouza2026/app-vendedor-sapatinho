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

export function ativarConta(dados: { codigoErpLoja: string; cpf: string; token: string; senha: string }) {
  return apiFetch<{ token: string; vendedor: { id: string; nome: string; papel: string } }>('/auth/ativacao', {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

export function alterarSenha(senhaAtual: string, novaSenha: string) {
  return apiFetch<void>('/auth/senha', { method: 'POST', body: JSON.stringify({ senhaAtual, novaSenha }) });
}
