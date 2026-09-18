import { apiFetch } from './client';
import { ProgressoPeriodo } from '../types';

export function buscarMinhasMetas() {
  // `sincronizadoEm`: hora do último snapshot do ERP (null se nunca houve sync).
  return apiFetch<{ vendedorId: string; progresso: ProgressoPeriodo[]; sincronizadoEm: string | null }>('/metas/minhas');
}
