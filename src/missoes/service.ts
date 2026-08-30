// API pública do módulo de Missões/Desafios (Fatia 7). Orquestra, nesta
// ordem, a cada leitura: garante a atribuição do dia/semana -> avalia
// progresso/conclusão contra evidência real -> devolve o estado fresco.
// Nunca aceita `completed`/`progress`/`reward` vindos do cliente (seção 44 —
// mass assignment) — essas rotas são todas GET, somente leitura.
import { prisma } from '../db';
import { inicioDoDia, inicioDaSemana } from '../services/metas.service';
import { garantirMissoesDoDia, garantirDesafiosDaSemana } from './atribuicao.service';
import { avaliarMissoesDoVendedor, avaliarDesafiosDoVendedor } from './avaliacao.service';

export class MissaoError extends Error {
  constructor(
    public type: 'not_found',
    message: string
  ) {
    super(message);
  }
}

function serializar(assignment: {
  id: string;
  status: string;
  progressoAtual: unknown;
  progressoAlvo: unknown;
  startsAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: assignment.id,
    status: assignment.status,
    progressoAtual: Number(assignment.progressoAtual),
    progressoAlvo: Number(assignment.progressoAlvo),
    startsAt: assignment.startsAt,
    expiresAt: assignment.expiresAt,
    completedAt: assignment.completedAt,
  };
}

export async function getMissoesAtivas(vendedorId: string, agora: Date = new Date()) {
  await garantirMissoesDoDia(vendedorId, agora);
  await avaliarMissoesDoVendedor(vendedorId, agora);

  const hoje = inicioDoDia(agora);
  const assignments = await prisma.missionAssignment.findMany({
    where: { vendedorId, startsAt: hoje },
    include: { definicao: true },
    orderBy: { createdAt: 'asc' },
  });

  return assignments.map((a) => ({
    ...serializar(a),
    missao: {
      code: a.definicao.code,
      title: a.definicao.title,
      description: a.definicao.description,
      category: a.definicao.category,
      actionType: a.definicao.actionType,
      actionReference: a.definicao.actionReference,
    },
  }));
}

export async function getHistoricoMissoes(vendedorId: string) {
  const assignments = await prisma.missionAssignment.findMany({
    where: { vendedorId, status: { in: ['COMPLETED', 'EXPIRED'] } },
    include: { definicao: true },
    orderBy: { startsAt: 'desc' },
    take: 30,
  });

  return assignments.map((a) => ({
    ...serializar(a),
    missao: { code: a.definicao.code, title: a.definicao.title, category: a.definicao.category },
  }));
}

export async function getMissaoPorId(id: string, vendedorId: string) {
  const assignment = await prisma.missionAssignment.findUnique({ where: { id }, include: { definicao: true } });
  // Mesmo erro (not_found) tanto pra "não existe" quanto "não é sua missão"
  // — nunca revela a um vendedor que a missão de outro existe (IDOR-safe).
  if (!assignment || assignment.vendedorId !== vendedorId) {
    throw new MissaoError('not_found', 'missão não encontrada');
  }
  return {
    ...serializar(assignment),
    missao: {
      code: assignment.definicao.code,
      title: assignment.definicao.title,
      description: assignment.definicao.description,
      category: assignment.definicao.category,
      actionType: assignment.definicao.actionType,
      actionReference: assignment.definicao.actionReference,
    },
  };
}

export async function getDesafiosAtivos(vendedorId: string, agora: Date = new Date()) {
  await garantirDesafiosDaSemana(vendedorId, agora);
  await avaliarDesafiosDoVendedor(vendedorId, agora);

  const inicioSemana = inicioDaSemana(agora);
  const assignments = await prisma.challengeAssignment.findMany({
    where: { vendedorId, startsAt: inicioSemana },
    include: { definicao: true },
    orderBy: { createdAt: 'asc' },
  });

  return assignments.map((a) => ({
    ...serializar(a),
    desafio: { code: a.definicao.code, title: a.definicao.title, description: a.definicao.description },
  }));
}

export async function getHistoricoDesafios(vendedorId: string) {
  const assignments = await prisma.challengeAssignment.findMany({
    where: { vendedorId, status: { in: ['COMPLETED', 'EXPIRED'] } },
    include: { definicao: true },
    orderBy: { startsAt: 'desc' },
    take: 20,
  });

  return assignments.map((a) => ({
    ...serializar(a),
    desafio: { code: a.definicao.code, title: a.definicao.title },
  }));
}

/** Contexto mínimo pro Coach (seção 36 — "não enviar banco inteiro de missões"). */
export async function getMissaoPrioritariaParaCoach(vendedorId: string, agora: Date = new Date()) {
  const ativas = await getMissoesAtivas(vendedorId, agora);
  const pendente = ativas.find((m) => m.status === 'ASSIGNED' || m.status === 'IN_PROGRESS');
  if (!pendente) return null;
  return {
    title: pendente.missao.title,
    progresso: pendente.progressoAlvo > 0 ? Math.round((pendente.progressoAtual / pendente.progressoAlvo) * 100) : 0,
    actionType: pendente.missao.actionType,
  };
}
