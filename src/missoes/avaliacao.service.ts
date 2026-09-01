// MissionEvaluationService (Fatia 7, seção 7/10/21/22/23). Roda sob demanda
// (seção 41: "se integração síncrona simples for mais segura, usar" — sem
// worker novo) sempre que o vendedor consulta suas missões/desafios.
//
// State machine: ASSIGNED/IN_PROGRESS -> COMPLETED (nunca o contrário sem
// evento explícito) ou -> EXPIRED (nunca por causa de conclusão perdida —
// seção 28, "não punir"). Transição sempre via update condicional
// (WHERE status IN [...]) — nunca read-then-write — pra ficar seguro sob
// concorrência (mesma lição das Fatias 4-6).
//
// Sobre reversão (seção 23): DAILY_GOAL/PA_IMPROVEMENT/TICKET_IMPROVEMENT são
// avaliadas ao vivo (mesma janela intraday que o próprio motor usa pra
// conceder o evento original) — se um resync do ERP reverter o crédito
// DEPOIS da missão já estar COMPLETED, a missão NÃO volta atrás (mesmo
// racional de "não punir": o que já foi reconhecido não é retirado).
// Documentado como decisão v1 em 05-Decisoes-e-Tradeoffs.md.
import { StatusMissao } from '@prisma/client';
import { prisma } from '../db';
import { avaliarCriterio, avaliarCriterioDesafio } from './criterio.service';
import { concederBonusMissao } from './recompensa.service';
import { createLogger } from '../utils/logger';
import { gerarEvidenciaDeMissao } from '../universidade/evidence.service';
import { concluirItemPDIPorConteudo } from '../universidade/pdi.service';

const log = createLogger('missoes:avaliacao');

const ATIVOS: StatusMissao[] = ['ASSIGNED', 'IN_PROGRESS'];

export async function avaliarMissoesDoVendedor(vendedorId: string, agora: Date = new Date()) {
  const ativas = await prisma.missionAssignment.findMany({
    where: { vendedorId, status: { in: ATIVOS } },
    include: { definicao: true },
  });

  for (const assignment of ativas) {
    if (assignment.expiresAt <= agora) {
      // Expira sem punição (seção 28) — nunca remove XP/moeda, nunca badge negativo.
      await prisma.missionAssignment.updateMany({
        where: { id: assignment.id, status: { in: ATIVOS } },
        data: { status: 'EXPIRED' },
      });
      continue;
    }

    const resultado = await avaliarCriterio(assignment.definicao.criterionType, vendedorId, {
      inicio: assignment.startsAt,
      fim: agora,
    });

    await prisma.missionAssignment.update({
      where: { id: assignment.id },
      data: { progressoAtual: resultado.progressoAtual, progressoAlvo: resultado.progressoAlvo },
    });

    if (!resultado.atingido) continue;

    const transicao = await prisma.missionAssignment.updateMany({
      where: { id: assignment.id, status: { in: ATIVOS } },
      data: { status: 'COMPLETED', completedAt: agora },
    });
    if (transicao.count === 0) continue; // outra chamada concorrente já concluiu — idempotente, não reprocessa

    log.info({ vendedorId, missao: assignment.definicao.code }, 'missão concluída');
    await concederBonusMissao({
      empresaId: assignment.empresaId,
      lojaId: assignment.lojaId,
      vendedorId,
      referenciaTipo: 'MISSAO',
      referenciaId: assignment.id,
      idempotencyKey: `missao-${assignment.id}`,
    });

    // Universidade (Fatia 7.5E, seção 25) — só gera evidência se a missão
    // foi explicitamente mapeada a alguma competência; reward e evidence
    // continuam domínios separados (seção 23).
    await gerarEvidenciaDeMissao(vendedorId, assignment.definicao.id, assignment.id);
    await concluirItemPDIPorConteudo(vendedorId, 'MISSION', assignment.definicao.id);
  }
}

export async function avaliarDesafiosDoVendedor(vendedorId: string, agora: Date = new Date()) {
  const ativos = await prisma.challengeAssignment.findMany({
    where: { vendedorId, status: { in: ATIVOS } },
    include: { definicao: true },
  });

  for (const assignment of ativos) {
    if (assignment.expiresAt <= agora) {
      await prisma.challengeAssignment.updateMany({
        where: { id: assignment.id, status: { in: ATIVOS } },
        data: { status: 'EXPIRED' },
      });
      continue;
    }

    const alvo = Number((assignment.definicao.criterionConfig as { alvo?: number } | null)?.alvo ?? 0);
    const resultado = await avaliarCriterioDesafio(assignment.definicao.criterionType, vendedorId, alvo, assignment.startsAt);

    await prisma.challengeAssignment.update({
      where: { id: assignment.id },
      data: { progressoAtual: resultado.progressoAtual, progressoAlvo: resultado.progressoAlvo },
    });

    if (!resultado.atingido) continue;

    const transicao = await prisma.challengeAssignment.updateMany({
      where: { id: assignment.id, status: { in: ATIVOS } },
      data: { status: 'COMPLETED', completedAt: agora },
    });
    if (transicao.count === 0) continue;

    log.info({ vendedorId, desafio: assignment.definicao.code }, 'desafio concluído');
    await concederBonusMissao({
      empresaId: assignment.empresaId,
      lojaId: assignment.lojaId,
      vendedorId,
      referenciaTipo: 'DESAFIO',
      referenciaId: assignment.id,
      idempotencyKey: `desafio-${assignment.id}`,
    });
  }
}
