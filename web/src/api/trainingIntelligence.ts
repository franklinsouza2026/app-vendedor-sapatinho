import { apiFetch } from './client';

export type StatusJobTreinamento = 'QUEUED' | 'RUNNING' | 'WAITING_REVIEW' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TipoJobTreinamento = 'PACOTE_TREINAMENTO' | 'ATUALIZACAO_CONTEUDO';
export type StatusGovernanca = 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED';
export type StatusConteudo = 'DRAFT' | 'REVIEW_PENDING' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface TrainingSource {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  reliability: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface TrainingGovernanceFinding {
  id: string;
  type: string;
  severity: StatusGovernanca;
  message: string;
}

export interface TrainingScenarioDraft {
  id: string;
  title: string;
  context: string;
  status: StatusConteudo;
  publishedScenarioId: string | null;
}

export interface TrainingIntelligenceJob {
  id: string;
  type: TipoJobTreinamento;
  topic: string;
  objective: string | null;
  status: StatusJobTreinamento;
  currentStep: string | null;
  errorMessage: string | null;
  governanceStatus: StatusGovernanca | null;
  reviewOutcome: string | null;
  reviewNotes: string | null;
  updateRecommendation: string | null;
  createdAt: string;
  sources: TrainingSource[];
  findings: TrainingGovernanceFinding[];
  cenarios: TrainingScenarioDraft[];
}

export interface DraftQuestion {
  id: string;
  question: string;
  active: boolean;
  opcoes: { id: string; text: string; correct: boolean }[];
}

export interface JobDetalhado {
  job: TrainingIntelligenceJob;
  draftLesson: { id: string; title: string; content: string; status: StatusConteudo } | null;
  draftQuestions: DraftQuestion[];
  draftScenarios: TrainingScenarioDraft[];
}

export function criarJobTreinamento(dados: { topic?: string; naturalLanguageRequest?: string; objective?: string; type?: TipoJobTreinamento; targetLessonId?: string }) {
  return apiFetch<TrainingIntelligenceJob>('/admin/training/ai/jobs', { method: 'POST', body: JSON.stringify(dados) });
}

export function listarJobsTreinamento() {
  return apiFetch<{ jobs: TrainingIntelligenceJob[] }>('/admin/training/ai/jobs');
}

export function buscarJobTreinamento(id: string) {
  return apiFetch<JobDetalhado>(`/admin/training/ai/jobs/${id}`);
}

export function cancelarJobTreinamento(id: string) {
  return apiFetch<TrainingIntelligenceJob>(`/admin/training/ai/jobs/${id}/cancel`, { method: 'POST' });
}

export function revisarJobTreinamento(id: string, outcome: 'APPROVED' | 'REJECTED', notes?: string) {
  return apiFetch<TrainingIntelligenceJob>(`/admin/training/ai/jobs/${id}/review`, { method: 'POST', body: JSON.stringify({ outcome, notes }) });
}

export function listarCenariosTreinamento() {
  return apiFetch<{ cenarios: TrainingScenarioDraft[] }>('/admin/training/ai/scenarios');
}

export function transicionarCenarioTreinamento(id: string, transicao: 'submeter' | 'aprovar' | 'publicar' | 'arquivar') {
  return apiFetch<TrainingScenarioDraft>(`/admin/training/ai/scenarios/${id}/${transicao}`, { method: 'POST' });
}
