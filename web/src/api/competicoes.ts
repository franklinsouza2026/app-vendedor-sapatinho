import { apiFetch } from './client';

export type StatusSeason = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type StatusCompeticao = StatusSeason;
export type TipoParticipante = 'SELLER' | 'STORE';
export type TipoMetricaCompeticao = 'GOAL_ATTAINMENT' | 'PERSONAL_IMPROVEMENT' | 'SCORE_GERAL' | 'PA' | 'TICKET_MEDIO' | 'TRAINING' | 'COMPETENCY_EVOLUTION' | 'MISSION_COMPLETION' | 'CONSISTENCY' | 'CUSTOM_RULE';
export type TipoReconhecimento = 'PERFORMANCE' | 'EVOLUTION' | 'LEARNING' | 'TEAMWORK' | 'CONSISTENCY' | 'LEADERSHIP' | 'CUSTOM';

export interface Season {
  id: string;
  code: string;
  name: string;
  description: string;
  status: StatusSeason;
  startsAt: string;
  endsAt: string;
}

export interface Competicao {
  id: string;
  seasonId: string | null;
  code: string;
  name: string;
  description: string;
  participantType: TipoParticipante;
  metricType: TipoMetricaCompeticao;
  status: StatusCompeticao;
  startsAt: string;
  endsAt: string;
  rewardXp: number;
  rewardMoedas: number;
  rewardBadgeCodigo: string | null;
  minhaParticipacao?: { status: string; enrolledAt: string };
}

export interface LinhaRanking {
  participantId: string;
  score: number;
  posicao: number;
  status: string;
}

export interface Liga {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  promotionThreshold: number | null;
  relegationThreshold: number | null;
}

export interface FeedEventoDTO {
  id: string;
  eventType: string;
  visibility: string;
  createdAt: string;
  subjectNome: string | null;
  mensagem: string;
}

export interface Reconhecimento {
  id: string;
  tipo: TipoReconhecimento;
  authorId: string;
  subjectId: string;
  message: string | null;
  createdAt: string;
}

// ===== Seller =====

export function buscarTemporadaAtual() {
  return apiFetch<{ season: Season | null }>('/temporadas/atual');
}

export interface LinhaRankingSeason {
  participantId: string;
  points: number;
  posicao: number;
  nomeVendedor: string;
}

export function buscarRankingTemporada(seasonId: string) {
  return apiFetch<{ ranking: LinhaRankingSeason[] }>(`/temporadas/${seasonId}/ranking`);
}

export function listarMinhasCompeticoes() {
  return apiFetch<{ competicoes: Competicao[] }>('/competicoes');
}

export function buscarCompeticao(id: string) {
  return apiFetch<{ competicao: Competicao; ranking: LinhaRanking[] }>(`/competicoes/${id}`);
}

export function listarMinhasLigas() {
  return apiFetch<{ ligas: Liga[]; minhaLiga: Liga | null }>('/ligas');
}

export function listarFeed(cursor?: string) {
  const query = cursor ? `?cursor=${cursor}` : '';
  return apiFetch<{ eventos: FeedEventoDTO[]; proximoCursor: string | null }>(`/feed${query}`);
}

export function listarMeusReconhecimentos() {
  return apiFetch<{ reconhecimentos: Reconhecimento[] }>('/reconhecimentos');
}

// ===== Manager =====

export function listarCompeticoesAtivasEquipe() {
  return apiFetch<{ competicoes: Competicao[] }>('/equipe/competicoes');
}

export function reconhecerVendedor(vendedorId: string, dados: { tipo: TipoReconhecimento; message?: string }) {
  return apiFetch<Reconhecimento>(`/equipe/${vendedorId}/reconhecimentos`, { method: 'POST', body: JSON.stringify(dados) });
}

export function listarReconhecimentosDoVendedor(vendedorId: string) {
  return apiFetch<{ reconhecimentos: Reconhecimento[] }>(`/equipe/${vendedorId}/reconhecimentos`);
}

// ===== Admin =====

export function listarSeasonsAdmin() {
  return apiFetch<{ seasons: Season[] }>('/admin/competicoes/seasons');
}

export function criarSeasonAdmin(dados: { code: string; name: string; description: string; startsAt: string; endsAt: string }) {
  return apiFetch<Season>('/admin/competicoes/seasons', { method: 'POST', body: JSON.stringify(dados) });
}

export function transicionarSeasonAdmin(id: string, transicao: 'agendar' | 'ativar' | 'cancelar') {
  return apiFetch<Season>(`/admin/competicoes/seasons/${id}/${transicao}`, { method: 'POST' });
}

export function finalizarSeasonAdmin(id: string) {
  return apiFetch<Season>(`/admin/competicoes/seasons/${id}/finalizar`, { method: 'POST' });
}

export function listarCompeticoesAdmin(status?: StatusCompeticao) {
  const query = status ? `?status=${status}` : '';
  return apiFetch<{ competicoes: Competicao[] }>(`/admin/competicoes${query}`);
}

export function criarCompeticaoAdmin(dados: {
  seasonId?: string;
  code: string;
  name: string;
  description: string;
  participantType: TipoParticipante;
  metricType: TipoMetricaCompeticao;
  competencyId?: string;
  startsAt: string;
  endsAt: string;
  minDiasAtivos?: number;
  rewardXp?: number;
  rewardMoedas?: number;
  rewardBadgeCodigo?: string;
}) {
  return apiFetch<Competicao>('/admin/competicoes', { method: 'POST', body: JSON.stringify(dados) });
}

export function transicionarCompeticaoAdmin(id: string, transicao: 'agendar' | 'ativar' | 'cancelar') {
  return apiFetch<Competicao>(`/admin/competicoes/${id}/${transicao}`, { method: 'POST' });
}

export function finalizarCompeticaoAdmin(id: string) {
  return apiFetch(`/admin/competicoes/${id}/finalizar`, { method: 'POST' });
}

export function listarLigasAdmin() {
  return apiFetch<{ ligas: Liga[] }>('/admin/competicoes/ligas');
}

export function criarLigaAdmin(dados: { code: string; name: string; sortOrder: number; promotionThreshold?: number; relegationThreshold?: number }) {
  return apiFetch<Liga>('/admin/competicoes/ligas', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarLigaAdmin(id: string, dados: Partial<{ name: string; sortOrder: number; promotionThreshold: number; relegationThreshold: number; active: boolean }>) {
  return apiFetch<Liga>(`/admin/competicoes/ligas/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}
