import { apiFetch } from './client';
import { Desafio, Missao } from '../types';

export function buscarMissoesAtivas() {
  return apiFetch<{ missoes: Missao[] }>('/missoes/ativas');
}

export function buscarHistoricoMissoes() {
  return apiFetch<{ missoes: Missao[] }>('/missoes/historico');
}

export function buscarDesafiosAtivos() {
  return apiFetch<{ desafios: Desafio[] }>('/desafios/ativos');
}

export function buscarHistoricoDesafios() {
  return apiFetch<{ desafios: Desafio[] }>('/desafios/historico');
}
