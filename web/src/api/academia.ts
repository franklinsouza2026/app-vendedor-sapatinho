import { apiFetch } from './client';
import { AulaDetalhada, ProgressoGeral, QuizParaResponder, ResultadoQuiz, TrilhaResumo } from '../types';

export function buscarTrilhas() {
  return apiFetch<{ trilhas: TrilhaResumo[] }>('/academia/trilhas');
}

export function buscarProgressoGeral() {
  return apiFetch<ProgressoGeral>('/academia/progresso');
}

export function buscarAula(lessonId: string) {
  return apiFetch<AulaDetalhada>(`/academia/aulas/${lessonId}`);
}

export function iniciarAula(lessonId: string) {
  return apiFetch<unknown>(`/academia/aulas/${lessonId}/iniciar`, { method: 'POST' });
}

export function concluirAula(lessonId: string) {
  return apiFetch<unknown>(`/academia/aulas/${lessonId}/concluir`, { method: 'POST' });
}

export function buscarQuiz(lessonId: string) {
  return apiFetch<QuizParaResponder>(`/academia/aulas/${lessonId}/quiz`);
}

export function responderQuiz(lessonId: string, respostas: { questionId: string; optionId: string }[]) {
  return apiFetch<ResultadoQuiz>(`/academia/aulas/${lessonId}/quiz/responder`, {
    method: 'POST',
    body: JSON.stringify({ respostas }),
  });
}
