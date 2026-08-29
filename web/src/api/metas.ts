import { apiFetch } from './client';
import { ProgressoPeriodo } from '../types';

export function buscarMinhasMetas() {
  return apiFetch<{ vendedorId: string; progresso: ProgressoPeriodo[] }>('/metas/minhas');
}
