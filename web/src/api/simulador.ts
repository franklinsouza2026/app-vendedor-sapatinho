import { apiFetch } from './client';
import { CenarioSimulador, DificuldadeSimulacao, EnviarMensagemSimuladorResultado, HistoricoSimuladorItem, SessaoDetalhadaSimulador, SessaoSimulador } from '../types';

export function buscarCenarios() {
  return apiFetch<{ cenarios: CenarioSimulador[] }>('/simulador/cenarios');
}

export function buscarHistorico() {
  return apiFetch<{ historico: HistoricoSimuladorItem[] }>('/simulador/historico');
}

export function criarSessao(scenarioId: string, difficulty: DificuldadeSimulacao) {
  return apiFetch<SessaoSimulador>('/simulador/sessoes', { method: 'POST', body: JSON.stringify({ scenarioId, difficulty }) });
}

export function buscarSessaoDetalhada(sessionId: string) {
  return apiFetch<SessaoDetalhadaSimulador>(`/simulador/sessoes/${sessionId}`);
}

export function enviarMensagem(sessionId: string, content: string) {
  const clientMessageId = crypto.randomUUID(); // idempotência — retry de rede não duplica nem cobra 2x
  return apiFetch<EnviarMensagemSimuladorResultado>(`/simulador/sessoes/${sessionId}/mensagens`, {
    method: 'POST',
    body: JSON.stringify({ content, clientMessageId }),
  });
}

export function encerrarSessao(sessionId: string) {
  return apiFetch<SessaoSimulador>(`/simulador/sessoes/${sessionId}/encerrar`, { method: 'POST' });
}
