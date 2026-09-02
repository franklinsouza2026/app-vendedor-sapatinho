// Cliente do Admin — configuração de thresholds do Painel Gerencial (Fatia
// 9, seção 66-70). Só ADMIN; nunca aceita uma fórmula livre.
import { apiFetch } from './client';
import { TipoAlertaGerencial } from './managerPanel';

export interface ConfigAlertaDTO {
  tipo: TipoAlertaGerencial;
  ativo: boolean;
  parametros: Record<string, number>;
  versao: number;
}

export function listarConfigsAlertas() {
  return apiFetch<{ configs: ConfigAlertaDTO[]; tiposDisponiveis: TipoAlertaGerencial[] }>('/admin/gerencial/alertas/config');
}

export function atualizarConfigAlerta(tipo: TipoAlertaGerencial, ativo: boolean, parametros: Record<string, number>) {
  return apiFetch<ConfigAlertaDTO>(`/admin/gerencial/alertas/config/${tipo}`, { method: 'PUT', body: JSON.stringify({ ativo, parametros }) });
}
