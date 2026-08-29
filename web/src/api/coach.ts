import { apiFetch } from './client';
import { CheckIn, Conversa, MensagemCoach, Mood } from '../types';

export function registrarCheckin(mood: Mood) {
  return apiFetch<CheckIn>('/coach/check-in', { method: 'POST', body: JSON.stringify({ mood }) });
}

export function buscarCheckinHoje() {
  return apiFetch<CheckIn | null>('/coach/check-in/hoje');
}

export function buscarConversaAtual() {
  return apiFetch<Conversa>('/coach/conversations/current');
}

export function criarNovaConversa() {
  return apiFetch<Conversa>('/coach/conversations', { method: 'POST' });
}

export function buscarMensagens(conversationId: string) {
  return apiFetch<{ mensagens: MensagemCoach[] }>(`/coach/conversations/${conversationId}/messages`);
}

export function enviarMensagem(conversationId: string, content: string) {
  const clientMessageId = crypto.randomUUID(); // idempotência — retry de rede não duplica nem cobra 2x
  return apiFetch<MensagemCoach>(`/coach/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, clientMessageId }),
  });
}
