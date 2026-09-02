// Cliente do Painel Gerencial (Fatia 9) — só GERENTE. Espelha exatamente os
// tipos de src/routes/manager-panel.ts, nunca reinterpreta status no cliente.
import { apiFetch } from './client';

export type TipoAlertaGerencial =
  | 'LOW_GOAL_ATTAINMENT'
  | 'PA_BELOW_BASELINE'
  | 'TICKET_BELOW_BASELINE'
  | 'CONSISTENCY_DROP'
  | 'NO_SALES_RECENTLY'
  | 'MISSION_STALLED'
  | 'TRAINING_OVERDUE'
  | 'CERTIFICATION_EXPIRING'
  | 'PDI_STALLED'
  | 'COMPETENCY_GAP'
  | 'NO_RECENT_MANAGER_FOLLOWUP';

export type SeveridadeAlerta = 'LOW' | 'MEDIUM' | 'HIGH';
export type StatusAlerta = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface ManagerAlertDTO {
  id: string;
  tipo: TipoAlertaGerencial;
  severidade: SeveridadeAlerta;
  status: StatusAlerta;
  sellerId: string | null;
  detectedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface StoreSummary {
  lojaId: string;
  referencia: string;
  metaFaturamento: number | null;
  realizado: number;
  percentualAtingido: number | null;
  faltaParaMeta: number | null;
  pa: number;
  ticketMedio: number;
  vendedoresAtivosHoje: number;
  totalVendedores: number;
  freshness: string | null;
}

export interface SinalPositivoDTO {
  tipo: string;
  sellerId: string;
  descricao: string;
  metadata: Record<string, unknown>;
}

export interface PendenciasResumo {
  vendedoresAbaixoDaMetaEsperada: number;
  followUpsPendentes: number;
  followUpsVencidos: number;
  reconhecimentosSugeridos: number;
  treinamentosPendentes: number;
}

export interface GerenteHomeDTO {
  storeSummary: StoreSummary;
  alertasPrioritarios: ManagerAlertDTO[];
  highlights: SinalPositivoDTO[];
  pendenciasResumo: PendenciasResumo;
}

export function buscarGerenteHome() {
  return apiFetch<GerenteHomeDTO>('/gerente/home');
}

export interface LinhaEquipeDTO {
  vendedorId: string;
  nome: string;
  percentualMetaDia: number | null;
  pa: number;
  ticketMedio: number;
  missoesAtivas: number;
  pdiAtivo: boolean;
  certificacoesExpirando: number;
  alertasAbertos: number;
  alertaMaisSeveroTipo: string | null;
  alertaMaisSeveroSeveridade: SeveridadeAlerta | null;
}

export function listarVisaoEquipe() {
  return apiFetch<{ vendedores: LinhaEquipeDTO[] }>('/gerente/equipe');
}

export interface EquipeDetalheDTO {
  vendedor: { id: string; nome: string };
  matriz: { competencyId: string; name?: string; score: number | null; target: number; gap: number | null; priority: 'LOW' | 'MEDIUM' | 'HIGH'; status: 'OK' | 'NOT_ENOUGH_DATA' }[];
  pdis: { id: string; competencia?: { name: string }; targetScore: number; status: string }[];
  alertas: ManagerAlertDTO[];
  oneOnOnes: OneOnOneDTO[];
  planos: ActionPlanDTO[];
  certificacoes: { id: string; status: string; expiresAt: string | null; definicao: { name: string; code: string } }[];
  missoes: { id: string; status: string; definicao: { title: string } }[];
}

export function buscarEquipeDetalhe(vendedorId: string) {
  return apiFetch<EquipeDetalheDTO>(`/gerente/equipe/${vendedorId}/detalhe`);
}

export function listarAlertas(status?: StatusAlerta[]) {
  const qs = status ? `?status=${status.join(',')}` : '';
  return apiFetch<{ alertas: ManagerAlertDTO[] }>(`/gerente/alertas${qs}`);
}

export function reconhecerAlerta(id: string) {
  return apiFetch<void>(`/gerente/alertas/${id}/reconhecer`, { method: 'POST' });
}

export function resolverAlerta(id: string, tipoResolucao: 'RESOLVED_OPERATIONALLY' | 'METRIC_RECOVERED') {
  return apiFetch<void>(`/gerente/alertas/${id}/resolver`, { method: 'POST', body: JSON.stringify({ tipoResolucao }) });
}

export function dispensarAlerta(id: string) {
  return apiFetch<void>(`/gerente/alertas/${id}/dispensar`, { method: 'POST' });
}

export type TipoItemPlanoAcao = 'TALK' | 'OBSERVE' | 'TRAIN' | 'ASSIGN_MISSION' | 'ASSIGN_CONTENT' | 'CREATE_PDI' | 'REVIEW_PDI' | 'RECOGNIZE' | 'FOLLOW_UP' | 'CUSTOM_TEXT';
export type StatusPlanoAcao = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface ActionItemDTO {
  id: string;
  tipo: TipoItemPlanoAcao;
  descricao: string;
  status: 'PENDING' | 'COMPLETED';
}

export interface ActionPlanDTO {
  id: string;
  subjectType: 'SELLER' | 'TEAM' | 'STORE';
  subjectId: string | null;
  title: string;
  description: string | null;
  status: StatusPlanoAcao;
  itens: ActionItemDTO[];
}

export function listarPlanos(subjectId?: string) {
  const qs = subjectId ? `?subjectId=${subjectId}` : '';
  return apiFetch<{ planos: ActionPlanDTO[] }>(`/gerente/planos-de-acao${qs}`);
}

export function criarPlano(input: { subjectType: 'SELLER' | 'TEAM' | 'STORE'; subjectId?: string; title: string; description?: string; sourceAlertId?: string; itens: { tipo: TipoItemPlanoAcao; descricao: string }[] }) {
  return apiFetch<ActionPlanDTO>('/gerente/planos-de-acao', { method: 'POST', body: JSON.stringify(input) });
}

export function ativarPlano(id: string) {
  return apiFetch<void>(`/gerente/planos-de-acao/${id}/ativar`, { method: 'POST' });
}

export function cancelarPlano(id: string) {
  return apiFetch<void>(`/gerente/planos-de-acao/${id}/cancelar`, { method: 'POST' });
}

export function concluirPlano(id: string) {
  return apiFetch<void>(`/gerente/planos-de-acao/${id}/concluir`, { method: 'POST' });
}

export function concluirItemPlano(planId: string, itemId: string) {
  return apiFetch<void>(`/gerente/planos-de-acao/${planId}/itens/${itemId}/concluir`, { method: 'POST' });
}

export type StatusOneOnOne = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface OneOnOneDTO {
  id: string;
  sellerId: string;
  status: StatusOneOnOne;
  scheduledAt: string | null;
  completedAt: string | null;
  pontosPositivos: string | null;
  pontosAtencao: string | null;
  compromissos: string | null;
}

export function listarOneOnOnes(vendedorId: string) {
  return apiFetch<{ encontros: OneOnOneDTO[] }>(`/gerente/1a1?vendedorId=${vendedorId}`);
}

export function criarOneOnOne(sellerId: string, scheduledAt?: string) {
  return apiFetch<OneOnOneDTO>('/gerente/1a1', { method: 'POST', body: JSON.stringify({ sellerId, scheduledAt }) });
}

export function iniciarOneOnOne(id: string) {
  return apiFetch<void>(`/gerente/1a1/${id}/iniciar`, { method: 'POST' });
}

export function concluirOneOnOne(id: string, notas: { pontosPositivos?: string; pontosAtencao?: string; compromissos?: string }) {
  return apiFetch<void>(`/gerente/1a1/${id}/concluir`, { method: 'POST', body: JSON.stringify(notas) });
}

export function cancelarOneOnOne(id: string) {
  return apiFetch<void>(`/gerente/1a1/${id}/cancelar`, { method: 'POST' });
}

export function buscarRoteiroSugerido1a1() {
  return apiFetch<{ perguntas: string[] }>('/gerente/1a1/roteiro-sugerido');
}

export interface FollowUpDTO {
  id: string;
  sellerId: string | null;
  descricao: string;
  dueAt: string;
  status: 'PENDING' | 'DONE' | 'DISMISSED';
}

export function listarFollowUps() {
  return apiFetch<{ followUps: FollowUpDTO[] }>('/gerente/follow-ups');
}

export function criarFollowUp(input: { sellerId?: string; descricao: string; dueAt: string }) {
  return apiFetch<FollowUpDTO>('/gerente/follow-ups', { method: 'POST', body: JSON.stringify(input) });
}

export function concluirFollowUp(id: string) {
  return apiFetch<void>(`/gerente/follow-ups/${id}/concluir`, { method: 'POST' });
}

export function dispensarFollowUp(id: string) {
  return apiFetch<void>(`/gerente/follow-ups/${id}/dispensar`, { method: 'POST' });
}

export interface ItemInboxDTO {
  tipo: 'ALERT' | 'FOLLOWUP' | 'RECOGNITION_SUGGESTION';
  sellerId: string | null;
  refId: string | null;
  detalhe: Record<string, unknown>;
}

export function buscarPendencias() {
  return apiFetch<{ resumo: PendenciasResumo; itens: ItemInboxDTO[] }>('/gerente/pendencias');
}

export interface DailyHuddleDTO {
  storeSummary: StoreSummary;
  faturamentoOntem: number;
  highlights: SinalPositivoDTO[];
  alertasPrioritarios: ManagerAlertDTO[];
  temporadaAtual: { id: string; name: string } | null;
  competicoesAtivas: { id: string; name: string }[];
  treinamentosDaSemana: number;
  focoSugerido: string | null;
}

export function buscarReuniaoDoDia() {
  return apiFetch<DailyHuddleDTO>('/gerente/reuniao-do-dia');
}

export interface ConselhoGerencialDTO {
  summary: string;
  priorities: { sellerId: string | null; description: string }[];
  suggestedRecognitions: { sellerId: string; reason: string }[];
}

export function pedirConselhoIA() {
  return apiFetch<ConselhoGerencialDTO>('/gerente/assistente/conselho', { method: 'POST' });
}
