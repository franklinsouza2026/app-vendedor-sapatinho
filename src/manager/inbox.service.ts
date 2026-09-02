// Manager Inbox / "PENDÊNCIAS" (Fatia 9, seção 58-62) — agrega alertas +
// follow-ups + sugestões de reconhecimento num único painel priorizado.
// Sempre NÃO-JUDICATIVO ("Hoje você tem: X vendedores abaixo da meta
// esperada", nunca "X vendedores ruins"). Zero cálculo novo — só agrega o
// que `alerts.service`/`followup.service`/`positive-signals.service` já
// produzem.
import { listarAlertas } from './alerts.service';
import { listarFollowUps } from './followup.service';
import { listarSinaisPositivosDaLoja } from './positive-signals.service';
import { ORDEM_PRIORIDADE_TIPO, ORDEM_SEVERIDADE } from './constantes';

export interface ItemInbox {
  tipo: 'ALERT' | 'FOLLOWUP' | 'RECOGNITION_SUGGESTION';
  prioridade: number;
  sellerId: string | null;
  refId: string | null;
  detalhe: Record<string, unknown>;
}

export interface ManagerInboxResumo {
  vendedoresAbaixoDaMetaEsperada: number;
  followUpsPendentes: number;
  followUpsVencidos: number;
  reconhecimentosSugeridos: number;
  treinamentosPendentes: number;
}

export interface ManagerInbox {
  resumo: ManagerInboxResumo;
  itens: ItemInbox[];
}

const LIMITE_ITENS_POR_LISTA = 20;

export async function montarInbox(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<ManagerInbox> {
  const [alertasAbertos, followUpsPendentes, sinaisPositivos] = await Promise.all([
    listarAlertas(empresaId, lojaId, { status: ['OPEN', 'ACKNOWLEDGED'] }),
    listarFollowUps(empresaId, lojaId, { status: ['PENDING'] }),
    listarSinaisPositivosDaLoja(empresaId, lojaId, agora),
  ]);

  const resumo: ManagerInboxResumo = {
    vendedoresAbaixoDaMetaEsperada: new Set(alertasAbertos.filter((a) => a.tipo === 'LOW_GOAL_ATTAINMENT').map((a) => a.sellerId)).size,
    followUpsPendentes: followUpsPendentes.length,
    followUpsVencidos: followUpsPendentes.filter((f) => f.dueAt <= agora).length,
    reconhecimentosSugeridos: sinaisPositivos.length,
    treinamentosPendentes: alertasAbertos.filter((a) => a.tipo === 'TRAINING_OVERDUE').length,
  };

  const itensAlertas: ItemInbox[] = alertasAbertos.slice(0, LIMITE_ITENS_POR_LISTA).map((a) => ({
    tipo: 'ALERT',
    prioridade: (ORDEM_PRIORIDADE_TIPO[a.tipo] ?? 99) * 10 + (ORDEM_SEVERIDADE[a.severidade] ?? 9),
    sellerId: a.sellerId,
    refId: a.id,
    detalhe: { alertType: a.tipo, severidade: a.severidade, detectedAt: a.detectedAt, metadata: a.metadata },
  }));

  const itensFollowUp: ItemInbox[] = followUpsPendentes.slice(0, LIMITE_ITENS_POR_LISTA).map((f) => ({
    tipo: 'FOLLOWUP',
    prioridade: f.dueAt <= agora ? 0 : 50,
    sellerId: f.sellerId,
    refId: f.id,
    detalhe: { descricao: f.descricao, dueAt: f.dueAt },
  }));

  const itensReconhecimento: ItemInbox[] = sinaisPositivos.slice(0, LIMITE_ITENS_POR_LISTA).map((s) => ({
    tipo: 'RECOGNITION_SUGGESTION',
    prioridade: 90,
    sellerId: s.sellerId,
    refId: null,
    detalhe: { signalType: s.tipo, descricao: s.descricao },
  }));

  const itens = [...itensAlertas, ...itensFollowUp, ...itensReconhecimento].sort((a, b) => a.prioridade - b.prioridade);

  return { resumo, itens };
}
