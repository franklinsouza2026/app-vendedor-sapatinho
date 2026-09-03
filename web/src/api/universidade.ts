import { apiFetch } from './client';

export type Nivel = 'INICIANTE' | 'EM_DESENVOLVIMENTO' | 'COMPETENTE' | 'AVANCADO';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type StatusPDI = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type StatusItemPDI = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type TipoItemPDI = 'LESSON' | 'TRACK' | 'QUIZ' | 'SIMULATION' | 'MISSION' | 'PRACTICE' | 'MANAGER_ACTION' | 'REVIEW';
export type StatusUserCertificacao = 'VALID' | 'EXPIRING' | 'EXPIRED';
export type StatusConteudo = 'DRAFT' | 'REVIEW_PENDING' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface CompetenciaMatriz {
  competencyId: string;
  code: string;
  name: string;
  category: string | null;
  status: 'OK' | 'NOT_ENOUGH_DATA';
  score: number | null;
  confidence: Confidence | null;
  nivel: Nivel | null;
  lastEvidenceAt: string | null;
  evidenceCount: number;
  target: number;
  gap: number | null;
  priority: Priority;
  breakdown: { sourceType: string; count: number; avgScore: number }[];
}

export interface ItemParaVoce {
  tipo: string;
  titulo: string;
  descricao: string;
  refId: string;
  href: string;
}

export interface DevelopmentPlanItem {
  id: string;
  tipo: TipoItemPDI;
  sourceId: string | null;
  status: StatusItemPDI;
  required: boolean;
}

export interface DevelopmentPlan {
  id: string;
  subjectUserId: string;
  competencyId: string;
  baselineScore: number | null;
  targetScore: number;
  status: StatusPDI;
  startedAt: string;
  targetDate: string | null;
  completedAt: string | null;
  itens: DevelopmentPlanItem[];
  competencia?: { id: string; name: string };
}

export interface RevisaoPendente {
  id: string;
  questionId: string;
  questionStatement: string;
  opcoes: { id: string; text: string }[];
  lessonId: string;
  lessonTitle: string;
  nextReviewAt: string;
}

export interface TemplateCertificado {
  templateTitle: string | null;
  templateBody: string | null;
  signatureName: string | null;
  signatureRole: string | null;
}

export interface Certificacao {
  id: string;
  definitionId: string;
  definitionVersion: number;
  issuedAt: string;
  expiresAt: string | null;
  status: StatusUserCertificacao;
  definicao: { id: string; name: string; description: string } & TemplateCertificado;
}

export interface CertificacaoDisponivel {
  definicao: { id: string; name: string; description: string; status: StatusConteudo };
  elegibilidade: { elegivel: boolean; pendencias: string[] };
}

export function buscarMinhaMatriz() {
  return apiFetch<{ competencias: CompetenciaMatriz[] }>('/universidade/minha-matriz');
}

export function buscarParaVoce() {
  return apiFetch<{ itens: ItemParaVoce[] }>('/universidade/para-voce');
}

export function listarMeusPDIs() {
  return apiFetch<{ planos: DevelopmentPlan[] }>('/universidade/pdi');
}

export function buscarPDI(id: string) {
  return apiFetch<{ plano: DevelopmentPlan; evolucao: { antes: number; agora: number; delta: number } | null }>(`/universidade/pdi/${id}`);
}

export function listarRevisoesPendentes() {
  return apiFetch<{ revisoes: RevisaoPendente[] }>('/universidade/revisoes');
}

export function responderRevisao(id: string, optionId: string) {
  return apiFetch<{ acertou: boolean }>(`/universidade/revisoes/${id}/responder`, { method: 'POST', body: JSON.stringify({ optionId }) });
}

export function listarMinhasCertificacoes() {
  return apiFetch<{ certificacoes: Certificacao[] }>('/universidade/certificacoes');
}

export function listarCertificacoesDisponiveis() {
  return apiFetch<{ disponiveis: CertificacaoDisponivel[] }>('/universidade/certificacoes/disponiveis');
}

export function emitirCertificacao(definitionId: string) {
  return apiFetch<Certificacao>(`/universidade/certificacoes/${definitionId}/emitir`, { method: 'POST' });
}

// ===== Manager =====

export interface VendedorResumoEquipe {
  id: string;
  nome: string;
  matriculaErp: string;
}

export interface DesenvolvimentoVendedor {
  vendedor: { id: string; nome: string };
  matriz: CompetenciaMatriz[];
  pdis: DevelopmentPlan[];
  avaliacoes: { id: string; competencyId: string; rating: number; evidenceNote: string | null; createdAt: string }[];
}

export function listarEquipe() {
  return apiFetch<{ vendedores: VendedorResumoEquipe[] }>('/universidade/equipe');
}

export function buscarDesenvolvimentoVendedor(vendedorId: string) {
  return apiFetch<DesenvolvimentoVendedor>(`/universidade/equipe/${vendedorId}/desenvolvimento`);
}

export function registrarAvaliacao(vendedorId: string, dados: { competencyId: string; rating: number; evidenceNote?: string }) {
  return apiFetch(`/universidade/equipe/${vendedorId}/avaliacoes`, { method: 'POST', body: JSON.stringify(dados) });
}

export function criarPDIParaVendedor(vendedorId: string, dados: { competencyId: string; targetScore: number; itens: { tipo: TipoItemPDI; sourceId?: string; required?: boolean }[] }) {
  return apiFetch<DevelopmentPlan>(`/universidade/equipe/${vendedorId}/pdi`, { method: 'POST', body: JSON.stringify(dados) });
}

export interface SugestaoIA {
  tipo: string;
  sourceId: string;
  rationale: string;
  title: string;
}

export function sugerirSequenciaIA(vendedorId: string, competencyId: string) {
  return apiFetch<{ sugestoes: SugestaoIA[] }>(`/universidade/equipe/${vendedorId}/pdi/sugestao-ia`, { method: 'POST', body: JSON.stringify({ competencyId }) });
}

// ===== Admin =====

export interface Escola {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: string;
  active: boolean;
}

export function listarEscolasAdmin() {
  return apiFetch<{ escolas: Escola[] }>('/admin/universidade/escolas');
}

export function criarEscolaAdmin(dados: { code: string; name: string; description: string }) {
  return apiFetch<Escola>('/admin/universidade/escolas', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarEscolaAdmin(id: string, dados: Partial<{ name: string; description: string; active: boolean }>) {
  return apiFetch<Escola>(`/admin/universidade/escolas/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export interface CompetenciaAdmin {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: string;
  category: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

export function listarCompetenciasAdmin() {
  return apiFetch<{ competencias: CompetenciaAdmin[] }>('/admin/universidade/competencias');
}

export function criarCompetenciaAdmin(dados: { code: string; name: string; description: string; category?: string }) {
  return apiFetch<CompetenciaAdmin>('/admin/universidade/competencias', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCompetenciaAdmin(id: string, dados: Partial<{ name: string; description: string; status: 'ACTIVE' | 'ARCHIVED' }>) {
  return apiFetch<CompetenciaAdmin>(`/admin/universidade/competencias/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function definirTargetAdmin(competencyId: string, papel: string, targetScore: number) {
  return apiFetch(`/admin/universidade/competencias/${competencyId}/targets`, { method: 'PUT', body: JSON.stringify({ papel, targetScore }) });
}

export function mapearCompetenciasAdmin(tipo: 'track' | 'lesson' | 'question' | 'simulation' | 'mission', contentId: string, competencyIds: string[]) {
  return apiFetch(`/admin/universidade/mapear`, { method: 'POST', body: JSON.stringify({ tipo, contentId, competencyIds }) });
}

export interface CertificationDefinitionAdmin extends TemplateCertificado {
  id: string;
  code: string;
  name: string;
  description: string;
  status: StatusConteudo;
  version: number;
  validityMonths: number | null;
  requisitos: { id: string; tipo: string; refId: string | null; minScore: number | null }[];
}

export function listarCertificacoesAdmin() {
  return apiFetch<{ definicoes: CertificationDefinitionAdmin[] }>('/admin/universidade/certificacoes');
}

export function criarCertificacaoAdmin(dados: { code: string; name: string; description: string; validityMonths?: number }) {
  return apiFetch<CertificationDefinitionAdmin>('/admin/universidade/certificacoes', { method: 'POST', body: JSON.stringify(dados) });
}

export function definirRequisitosAdmin(id: string, requisitos: { tipo: string; refId?: string; minScore?: number }[]) {
  return apiFetch<CertificationDefinitionAdmin>(`/admin/universidade/certificacoes/${id}/requisitos`, { method: 'PUT', body: JSON.stringify({ requisitos }) });
}

export function transicionarCertificacaoAdmin(id: string, transicao: 'submeter' | 'aprovar' | 'publicar' | 'arquivar') {
  return apiFetch<CertificationDefinitionAdmin>(`/admin/universidade/certificacoes/${id}/${transicao}`, { method: 'POST' });
}

export function atualizarTemplateCertificacaoAdmin(id: string, template: Partial<TemplateCertificado>) {
  return apiFetch<CertificationDefinitionAdmin>(`/admin/universidade/certificacoes/${id}/template`, { method: 'PUT', body: JSON.stringify(template) });
}

export function listarPDIsAdmin(status?: StatusPDI) {
  const query = status ? `?status=${status}` : '';
  return apiFetch<{ planos: DevelopmentPlan[] }>(`/admin/universidade/pdi${query}`);
}
