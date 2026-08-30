import { apiFetch } from './client';

export type NomeProviderIA = 'MOCK' | 'ANTHROPIC' | 'OPENAI' | 'GEMINI';

export interface ProviderStatus {
  provider: NomeProviderIA;
  configured: boolean;
  credentialUpdatedAt: string | null;
  active: boolean;
  model: string | null;
  modelosPermitidos: string[];
  health: {
    status: 'NEVER_TESTED' | 'LAST_CALL_OK' | 'LAST_CALL_FAILED';
    lastCallAt: string | null;
    lastErrorType: string | null;
    lastLatencyMs: number | null;
  };
}

export interface VisaoGeralIA {
  mode: 'MANUAL';
  enabled: boolean;
  activeProvider: NomeProviderIA;
  providers: ProviderStatus[];
  budget: { monthlyLimitUSD: number; gastoMensalUSD: number };
}

export interface UsoIA {
  desde: string;
  total: { chamadas: number; inputTokens: number; outputTokens: number; custoEstimadoUSD: number };
  porProvider: { provider: string; chamadas: number; inputTokens: number; outputTokens: number; custoEstimadoUSD: number }[];
  porEspecialista: { specialist: string; chamadas: number; inputTokens: number; outputTokens: number; custoEstimadoUSD: number }[];
}

export function buscarVisaoGeralIA() {
  return apiFetch<VisaoGeralIA>('/admin/ai');
}

export function salvarCredencial(provider: NomeProviderIA, apiKey: string) {
  return apiFetch<void>(`/admin/ai/providers/${provider}/credential`, { method: 'PUT', body: JSON.stringify({ apiKey }) });
}

export function removerCredencial(provider: NomeProviderIA) {
  return apiFetch<void>(`/admin/ai/providers/${provider}/credential`, { method: 'DELETE' });
}

export function testarConexao(provider: NomeProviderIA) {
  return apiFetch<{ ok: boolean; latencyMs?: number; errorType?: string }>(`/admin/ai/providers/${provider}/test`, { method: 'POST' });
}

export function ativarProvider(provider: NomeProviderIA) {
  return apiFetch<void>(`/admin/ai/providers/${provider}/activate`, { method: 'POST' });
}

export function atualizarModelo(provider: NomeProviderIA, model: string) {
  return apiFetch<void>(`/admin/ai/providers/${provider}/model`, { method: 'PUT', body: JSON.stringify({ model }) });
}

export function atualizarBudgetIA(monthlyLimitUSD: number) {
  return apiFetch<void>('/admin/ai/budget', { method: 'PUT', body: JSON.stringify({ monthlyLimitUSD }) });
}

export function buscarUsoIA() {
  return apiFetch<UsoIA>('/admin/ai/usage');
}
