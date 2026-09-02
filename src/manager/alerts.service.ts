// Persistência e ciclo de vida de ManagerAlert (Fatia 9, seção 12-14).
// OPEN -> ACKNOWLEDGED -> RESOLVED, ou OPEN/ACKNOWLEDGED -> DISMISSED.
// `dismiss` NUNCA apaga histórico (soft state só, seção 95). Idempotência de
// geração via índice único PARCIAL em `dedupeKey` (só sobre OPEN/
// ACKNOWLEDGED) — o Attention Engine nunca duplica o mesmo alerta aberto,
// só atualiza `detectedAt`/`metadata`/`severidade` (achado recorrente
// continua sendo o MESMO registro, preservando `detectedAt` original só se
// já existir).
import { Prisma, StatusAlertaGerencial } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { ManagerError, ORDEM_PRIORIDADE_TIPO, ORDEM_SEVERIDADE } from './constantes';
import { detectarSinaisDaLoja, avaliarCompetencyGapDoVendedor, type SinalDetectado } from './attention-engine.service';

function dedupeKeyDe(lojaId: string, sinal: SinalDetectado): string {
  return `${lojaId}:${sinal.sellerId ?? 'STORE'}:${sinal.tipo}:${sinal.sourceId ?? 'NA'}`;
}

async function upsertAlerta(empresaId: string, lojaId: string, sinal: SinalDetectado) {
  const dedupeKey = dedupeKeyDe(lojaId, sinal);

  const existente = await prisma.managerAlert.findFirst({
    where: { dedupeKey, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
  });
  if (existente) {
    // Só atualiza o que pode ter mudado — nunca reabre um alerta já
    // reconhecido/resolvido por conta própria (isso é decisão do gerente).
    await prisma.managerAlert.update({
      where: { id: existente.id },
      data: { severidade: sinal.severidade, metadata: sinal.metadata as Prisma.InputJsonValue },
    });
    return;
  }

  try {
    await prisma.managerAlert.create({
      data: {
        empresaId,
        lojaId,
        sellerId: sinal.sellerId,
        tipo: sinal.tipo,
        severidade: sinal.severidade,
        dedupeKey,
        sourceType: sinal.sourceType,
        sourceId: sinal.sourceId,
        detectedAt: sinal.detectedAt,
        metadata: sinal.metadata as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // P2002 no índice parcial: outra requisição concorrente já criou o
    // mesmo alerta entre o findFirst e o create — idempotente, ignora.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
}

/** Roda o passe leve da loja inteira + persiste/atualiza os alertas
 * (idempotente). Chamado sempre que a Home/Equipe do gerente carrega. */
export async function sincronizarAlertasDaLoja(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<void> {
  const sinais = await detectarSinaisDaLoja(empresaId, lojaId, agora);
  await Promise.all(sinais.map((sinal) => upsertAlerta(empresaId, lojaId, sinal)));
}

/** Roda a checagem de COMPETENCY_GAP de 1 vendedor (cara, só sob demanda —
 * chamada a partir da tela de detalhe do vendedor). */
export async function sincronizarCompetencyGapDoVendedor(empresaId: string, lojaId: string, subjectUserId: string, agora: Date = new Date()): Promise<void> {
  const sinais = await avaliarCompetencyGapDoVendedor(empresaId, subjectUserId, agora);
  await Promise.all(sinais.map((sinal) => upsertAlerta(empresaId, lojaId, sinal)));
}

export interface FiltroAlertas {
  status?: StatusAlertaGerencial[];
  sellerId?: string;
}

export async function listarAlertas(empresaId: string, lojaId: string, filtro: FiltroAlertas = {}) {
  const alertas = await prisma.managerAlert.findMany({
    where: { empresaId, lojaId, status: { in: filtro.status ?? ['OPEN', 'ACKNOWLEDGED'] }, ...(filtro.sellerId ? { sellerId: filtro.sellerId } : {}) },
    orderBy: [{ detectedAt: 'desc' }],
  });

  return [...alertas].sort((a, b) => {
    const pa = ORDEM_PRIORIDADE_TIPO[a.tipo] ?? 99;
    const pb = ORDEM_PRIORIDADE_TIPO[b.tipo] ?? 99;
    if (pa !== pb) return pa - pb;
    const sa = ORDEM_SEVERIDADE[a.severidade] ?? 9;
    const sb = ORDEM_SEVERIDADE[b.severidade] ?? 9;
    if (sa !== sb) return sa - sb;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
}

async function buscarAlertaNoEscopo(empresaId: string, lojaId: string, alertId: string) {
  const alerta = await prisma.managerAlert.findFirst({ where: { id: alertId, empresaId, lojaId } });
  if (!alerta) throw new ManagerError('not_found', 'alerta não encontrado');
  return alerta;
}

/** Transição atômica condicional (mesmo padrão do Fatia 8: `updateMany` +
 * checar `count===1`) — 2 chamadas concorrentes de ack/resolve nunca geram
 * 2 eventos de auditoria pro mesmo alerta (idempotente). */
async function transicionar(empresaId: string, lojaId: string, alertId: string, de: StatusAlertaGerencial[], para: StatusAlertaGerencial, dadosExtra: Prisma.ManagerAlertUpdateManyMutationInput, actorId: string, acao: 'MANAGER_ALERT_ACKNOWLEDGED' | 'MANAGER_ALERT_RESOLVED' | 'MANAGER_ALERT_DISMISSED') {
  await buscarAlertaNoEscopo(empresaId, lojaId, alertId); // 404 genérico se fora do escopo

  const resultado = await prisma.managerAlert.updateMany({
    where: { id: alertId, empresaId, lojaId, status: { in: de } },
    data: { status: para, ...dadosExtra },
  });

  if (resultado.count === 1) {
    await registrarEventoAuditoria({ empresaId, acao, actorId, metadata: { alertId } });
  }
  // count === 0 (já tinha transicionado por outra chamada concorrente ou
  // pelo próprio usuário duas vezes) — idempotente, nunca lança erro.
}

export async function reconhecerAlerta(empresaId: string, lojaId: string, alertId: string, actorId: string) {
  await transicionar(empresaId, lojaId, alertId, ['OPEN'], 'ACKNOWLEDGED', { acknowledgedAt: new Date(), acknowledgedBy: actorId }, actorId, 'MANAGER_ALERT_ACKNOWLEDGED');
}

/** `tipoResolucao` distingue "o gerente agiu" de "a métrica se recuperou
 * sozinha" (seção 57) — nunca conflatar as duas semânticas. */
export async function resolverAlerta(empresaId: string, lojaId: string, alertId: string, tipoResolucao: 'RESOLVED_OPERATIONALLY' | 'METRIC_RECOVERED', actorId: string) {
  await transicionar(empresaId, lojaId, alertId, ['OPEN', 'ACKNOWLEDGED'], 'RESOLVED', { resolvedAt: new Date(), resolvedBy: actorId, tipoResolucao }, actorId, 'MANAGER_ALERT_RESOLVED');
}

export async function dispensarAlerta(empresaId: string, lojaId: string, alertId: string, actorId: string) {
  await transicionar(empresaId, lojaId, alertId, ['OPEN', 'ACKNOWLEDGED'], 'DISMISSED', { resolvedAt: new Date(), resolvedBy: actorId }, actorId, 'MANAGER_ALERT_DISMISSED');
}
