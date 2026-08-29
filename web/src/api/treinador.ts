import { apiFetch } from './client';
import { ConversaTreinador, MensagemTreinador, ModoTreinador, ObjecaoComum } from '../types';

export function buscarObjecoesComuns() {
  return apiFetch<{ objections: ObjecaoComum[] }>('/treinador/objections');
}

export function buscarConversaAtual() {
  return apiFetch<ConversaTreinador>('/treinador/conversations/current');
}

export function criarNovaConversa() {
  return apiFetch<ConversaTreinador>('/treinador/conversations', { method: 'POST' });
}

export function buscarMensagens(conversationId: string) {
  return apiFetch<{ mensagens: MensagemTreinador[] }>(`/treinador/conversations/${conversationId}/messages`);
}

export interface EnviarMensagemTreinadorInput {
  content: string;
  mode: ModoTreinador;
  objection?: string;
  situation?: string;
}

export function enviarMensagem(conversationId: string, input: EnviarMensagemTreinadorInput) {
  const clientMessageId = crypto.randomUUID(); // idempotência — retry de rede não duplica nem cobra 2x
  return apiFetch<MensagemTreinador>(`/treinador/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ ...input, clientMessageId }),
  });
}
