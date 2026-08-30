import { apiFetch } from './client';

export type StatusConteudo = 'DRAFT' | 'REVIEW_PENDING' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type PublicoConteudo = 'SELLER' | 'MANAGER' | 'BOTH';
export type TipoConteudoAula = 'TEXT' | 'VIDEO' | 'MATERIAL' | 'MIXED';
export type DificuldadeQuestao = 'BASICA' | 'INTERMEDIARIA' | 'SITUACIONAL';
export type Transicao = 'submeter' | 'aprovar' | 'publicar' | 'arquivar';

export interface DashboardTreinamento {
  trilhasPorStatus: Record<string, number>;
  aulasPorStatus: Record<string, number>;
  trilhasAtivas: number;
  quizzesAtivos: number;
  aulasSemQuiz: number;
}

export interface TrilhaAdmin {
  id: string;
  code: string;
  title: string;
  description: string;
  status: StatusConteudo;
  audience: PublicoConteudo;
  active: boolean;
  aulas: { id: string; title: string; status: StatusConteudo }[];
}

export interface AulaAdmin {
  id: string;
  trackId: string;
  code: string;
  title: string;
  description: string;
  content: string;
  status: StatusConteudo;
  audience: PublicoConteudo;
  tipoConteudo: TipoConteudoAula;
  videoUrl: string | null;
  materialUrl: string | null;
  active: boolean;
}

export interface QuestaoAdmin {
  id: string;
  question: string;
  difficulty: DificuldadeQuestao;
  active: boolean;
  opcoes: { id: string; text: string; correct: boolean }[];
}

export interface MandamentoAdmin {
  numero: number;
  titulo: string;
  conteudoOficial: string | null;
  explicacaoOpcional: string | null;
  exemploOpcional: string | null;
  versao: number;
  status: StatusConteudo;
}

export function buscarDashboardTreinamento() {
  return apiFetch<DashboardTreinamento>('/admin/training/overview');
}

export function listarTrilhasAdmin() {
  return apiFetch<{ trilhas: TrilhaAdmin[] }>('/admin/training/tracks');
}

export function criarTrilhaAdmin(dados: { code: string; title: string; description: string; audience?: PublicoConteudo }) {
  return apiFetch<TrilhaAdmin>('/admin/training/tracks', { method: 'POST', body: JSON.stringify(dados) });
}

export function transicionarTrilhaAdmin(id: string, transicao: Transicao) {
  return apiFetch<TrilhaAdmin>(`/admin/training/tracks/${id}/${transicao}`, { method: 'POST' });
}

export function listarAulasAdmin(trackId?: string) {
  const query = trackId ? `?trackId=${trackId}` : '';
  return apiFetch<{ aulas: AulaAdmin[] }>(`/admin/training/lessons${query}`);
}

export function criarAulaAdmin(dados: {
  trackId: string;
  code: string;
  title: string;
  description: string;
  content: string;
  estimatedMinutes: number;
  tipoConteudo?: TipoConteudoAula;
  videoUrl?: string;
  materialUrl?: string;
}) {
  return apiFetch<AulaAdmin>('/admin/training/lessons', { method: 'POST', body: JSON.stringify(dados) });
}

export function transicionarAulaAdmin(id: string, transicao: Transicao) {
  return apiFetch<AulaAdmin>(`/admin/training/lessons/${id}/${transicao}`, { method: 'POST' });
}

export function definirQuizDaAula(lessonId: string, dados: { passingScore?: number; questionsPerAttempt?: number | null }) {
  return apiFetch<{ id: string }>(`/admin/training/lessons/${lessonId}/quiz`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function listarQuestoesDoQuiz(quizId: string) {
  return apiFetch<{ questoes: QuestaoAdmin[] }>(`/admin/training/quizzes/${quizId}/questions`);
}

export function criarQuestaoAdmin(dados: { quizId: string; question: string; opcoes: { text: string; correct: boolean }[] }) {
  return apiFetch<QuestaoAdmin>('/admin/training/questions', { method: 'POST', body: JSON.stringify(dados) });
}

export function arquivarQuestaoAdmin(id: string) {
  return apiFetch<void>(`/admin/training/questions/${id}`, { method: 'DELETE' });
}

export function buscarMandamentosAdmin() {
  return apiFetch<{ mandamentos: MandamentoAdmin[]; completude: { completo: boolean; faltando: number[] } }>('/admin/training/mandamentos');
}

export function atualizarMandamentoAdmin(numero: number, dados: Partial<{ titulo: string; conteudoOficial: string; explicacaoOpcional: string; exemploOpcional: string }>) {
  return apiFetch<MandamentoAdmin>(`/admin/training/mandamentos/${numero}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function publicarMandamentoAdmin(numero: number) {
  return apiFetch<MandamentoAdmin>(`/admin/training/mandamentos/${numero}/publish`, { method: 'POST' });
}
