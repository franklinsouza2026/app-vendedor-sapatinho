// Competition (Fatia 8, seção 9-17/59-65) — backend é autoridade absoluta
// sobre elegibilidade, ranking, tie-break, vencedor e recompensa. Frontend
// nunca envia winner/finalRank/eligible/rewardGranted (seção 76/77).
import { StatusCompeticao, TipoParticipante, TipoMetricaCompeticao } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from '../universidade/schools.service';
import { concederXp, concederMoeda } from '../gamificacao/ledger.service';
import { concederBadge, CATALOGO_BADGES_V1, CodigoBadge } from '../gamificacao/badges.service';
import { registrarPontosSeason } from './seasons.service';
import { garantirMembroNaLiga } from './leagues.service';
import { publicarEventoFeed } from './feed.service';
import { avaliarFairness, calcularMetrica, diasAtivosEmLote } from './metricas.service';
import { CompeticoesError, METRICAS_COM_CALCULADOR } from './constantes';

export async function criarCompetition(
  dados: {
    seasonId?: string;
    code: string;
    name: string;
    description: string;
    participantType: TipoParticipante;
    metricType: TipoMetricaCompeticao;
    competencyId?: string;
    startsAt: Date;
    endsAt: Date;
    minDiasAtivos?: number;
    rewardXp?: number;
    rewardMoedas?: number;
    rewardBadgeCodigo?: string;
  },
  actorId: string
) {
  if (dados.endsAt <= dados.startsAt) throw new CompeticoesError('invalid_reference', 'endsAt precisa ser depois de startsAt');
  if (!METRICAS_COM_CALCULADOR.includes(dados.metricType)) throw new CompeticoesError('invalid_reference', `metricType "${dados.metricType}" não tem calculador implementado nesta fatia`);
  if (dados.metricType === 'COMPETENCY_EVOLUTION' && !dados.competencyId) throw new CompeticoesError('invalid_reference', 'COMPETENCY_EVOLUTION exige competencyId');
  if (dados.rewardBadgeCodigo && !CATALOGO_BADGES_V1.some((b) => b.codigo === dados.rewardBadgeCodigo)) throw new CompeticoesError('invalid_reference', `badge "${dados.rewardBadgeCodigo}" não existe no catálogo`);

  const competicao = await prisma.competition.create({ data: { ...dados, createdBy: actorId } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_CREATED', actorId, metadata: { competitionId: competicao.id } });
  return competicao;
}

export async function listarCompetitions(status?: StatusCompeticao) {
  return prisma.competition.findMany({ where: status ? { status } : {}, orderBy: { startsAt: 'desc' } });
}

export async function buscarCompetition(id: string) {
  const competicao = await prisma.competition.findUnique({ where: { id } });
  if (!competicao) throw new CompeticoesError('not_found', 'competição não encontrada');
  return competicao;
}

/** Editar regras depois de agendada/ativa incrementa `rulesVersion` (seção
 * 13/46) — nunca reescreve silenciosamente uma regra já em disputa. */
export async function atualizarRegrasCompetition(id: string, dados: Partial<{ name: string; description: string; minDiasAtivos: number; rewardXp: number; rewardMoedas: number; rewardBadgeCodigo: string }>, actorId: string) {
  if (dados.rewardBadgeCodigo && !CATALOGO_BADGES_V1.some((b) => b.codigo === dados.rewardBadgeCodigo)) throw new CompeticoesError('invalid_reference', `badge "${dados.rewardBadgeCodigo}" não existe no catálogo`);
  const atual = await buscarCompetition(id);
  const bump = atual.status !== 'DRAFT';
  const competicao = await prisma.competition.update({ where: { id }, data: { ...dados, ...(bump ? { rulesVersion: { increment: 1 } } : {}) } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_UPDATED', actorId, metadata: { competitionId: id, rulesVersion: competicao.rulesVersion } });
  return competicao;
}

/**
 * Auto-enrollment (seção 60) — inscreve todo participante elegível da
 * empresa que ainda não está inscrito. Idempotente (`skipDuplicates` do
 * Postgres — 2 ativações concorrentes nunca duplicam); nunca remove quem já
 * está inscrito, mesmo que deixe de ser elegível depois (desqualificação é
 * sempre um ato explícito, seção 61).
 *
 * Performance (seção 100/116): fairness é avaliada em LOTE (1 query de
 * `diasAtivosEmLote` pra todos os candidatos, não 1 por vendedor) e a
 * inscrição é um único `createMany` — nunca N queries sequenciais por
 * candidato, catálogo pode ter centenas/milhares de vendedores.
 */
export async function garantirParticipantesInscritos(competitionId: string, actorId?: string) {
  const competicao = await buscarCompetition(competitionId);
  const candidatoIds =
    competicao.participantType === 'SELLER'
      ? (await prisma.vendedor.findMany({ where: { papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true } })).map((v) => v.id)
      : (await prisma.loja.findMany({ select: { id: true } })).map((l) => l.id);

  const jaInscritos = await prisma.competitionParticipant.findMany({ where: { competitionId }, select: { participantId: true } });
  const jaInscritosSet = new Set(jaInscritos.map((p) => p.participantId));
  const novosCandidatos = candidatoIds.filter((id) => !jaInscritosSet.has(id));
  if (novosCandidatos.length === 0) return 0;

  const fimJanela = new Date() < competicao.endsAt ? new Date() : competicao.endsAt;
  const diasAtivosPorId = competicao.participantType === 'SELLER' ? await diasAtivosEmLote(novosCandidatos, competicao.startsAt, fimJanela) : new Map<string, number>();

  const avaliacoes = await Promise.all(novosCandidatos.map((participantId) => avaliarFairness(competicao, competicao.participantType, participantId, new Date(), diasAtivosPorId.get(participantId) ?? 0)));

  const resultado = await prisma.competitionParticipant.createMany({
    data: novosCandidatos.map((participantId, idx) => ({
      competitionId,
      participantType: competicao.participantType,
      participantId,
      status: avaliacoes[idx].elegivel ? 'ELIGIBLE' : 'DISQUALIFIED',
      disqualifiedReason: avaliacoes[idx].elegivel ? null : avaliacoes[idx].motivo,
      disqualifiedAt: avaliacoes[idx].elegivel ? null : new Date(),
    })),
    skipDuplicates: true,
  });

  if (competicao.seasonId) {
    await Promise.all(novosCandidatos.map((participantId) => garantirMembroNaLiga(competicao.seasonId!, competicao.participantType, participantId)));
  }
  if (resultado.count > 0) await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_PARTICIPANT_ADDED', actorId, metadata: { competitionId, novos: resultado.count } });
  return resultado.count;
}

const TRANSICOES_COMPETITION: Record<'agendar' | 'ativar' | 'cancelar', { de: StatusCompeticao[]; para: StatusCompeticao; acao: 'COMPETITION_STARTED' | 'COMPETITION_CANCELLED' | 'COMPETITION_UPDATED' }> = {
  agendar: { de: ['DRAFT'], para: 'SCHEDULED', acao: 'COMPETITION_UPDATED' },
  ativar: { de: ['SCHEDULED', 'DRAFT'], para: 'ACTIVE', acao: 'COMPETITION_STARTED' },
  cancelar: { de: ['DRAFT', 'SCHEDULED', 'ACTIVE'], para: 'CANCELLED', acao: 'COMPETITION_CANCELLED' },
};

export async function transicionarCompetition(id: string, transicao: keyof typeof TRANSICOES_COMPETITION, actorId?: string) {
  const regra = TRANSICOES_COMPETITION[transicao];
  const atual = await buscarCompetition(id);
  const resultado = await prisma.competition.updateMany({ where: { id, status: { in: regra.de } }, data: { status: regra.para } });
  if (resultado.count !== 1) throw new CompeticoesError('invalid_transition', `competição não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: regra.acao, actorId, metadata: { competitionId: id } });
  if (transicao === 'ativar') await garantirParticipantesInscritos(id, actorId);
  return buscarCompetition(id);
}

export async function desqualificarParticipante(competitionId: string, participantId: string, motivo: string, actorId: string) {
  const resultado = await prisma.competitionParticipant.updateMany({
    where: { competitionId, participantId, status: { in: ['ELIGIBLE', 'ACTIVE'] } },
    data: { status: 'DISQUALIFIED', disqualifiedAt: new Date(), disqualifiedReason: motivo, disqualifiedBy: actorId },
  });
  if (resultado.count !== 1) throw new CompeticoesError('invalid_transition', 'participante não está num estado desqualificável');
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_DISQUALIFIED', actorId, metadata: { competitionId, participantId, motivo } });
}

export interface LinhaRanking {
  participantId: string;
  score: number;
  consistencia: number | null;
  posicao: number;
  status: string;
}

/**
 * Ranking ao vivo (nunca persistido até a finalização) — tie-break fixo
 * (seção 15, documentado em constantes.ts): 1) score 2) consistência
 * 3) participantId (fallback técnico estável).
 */
export async function calcularRankingCompetition(competitionId: string): Promise<LinhaRanking[]> {
  const competicao = await buscarCompetition(competitionId);
  const participantes = await prisma.competitionParticipant.findMany({ where: { competitionId, status: { in: ['ELIGIBLE', 'ACTIVE'] } } });

  const linhas = await Promise.all(
    participantes.map(async (p) => {
      const resultado = await calcularMetrica(competicao, p.participantType, p.participantId);
      return { participantId: p.participantId, score: resultado.score, consistencia: resultado.consistencia, status: p.status };
    })
  );

  linhas.sort((a, b) => b.score - a.score || (b.consistencia ?? 0) - (a.consistencia ?? 0) || a.participantId.localeCompare(b.participantId));
  return linhas.map((l, idx) => ({ ...l, posicao: idx + 1 }));
}

/**
 * Finalização (seção 64/66) — gera snapshot IMUTÁVEL, concede recompensa
 * idempotente (badge + XP/moeda via o motor real, nunca inventado), publica
 * Feed. Transição ACTIVE→FINISHED + criação do snapshot acontecem na MESMA
 * transação Prisma (seção 84/103) — sob 2 chamadas concorrentes, a
 * perdedora nunca vê um estado "FINISHED mas sem resultados ainda": ou a
 * transação inteira da vencedora já commitou (status + snapshot completos),
 * ou ainda não commitou nada (a perdedora recebe `count!==1` e nunca lê o
 * status antigo capturado antes da corrida, sempre reconsulta o real).
 */
export async function finalizarCompetition(id: string, actorId?: string) {
  const competicaoAntesDaCorrida = await buscarCompetition(id);
  const ranking = await calcularRankingCompetition(id);

  const commitou = await prisma.$transaction(async (tx) => {
    const resultado = await tx.competition.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'FINISHED', finalizedAt: new Date() } });
    if (resultado.count !== 1) return false;

    for (const linha of ranking) {
      await tx.competitionResult.create({
        data: { competitionId: id, participantType: competicaoAntesDaCorrida.participantType, participantId: linha.participantId, rank: linha.posicao, score: linha.score, points: Math.max(0, Math.round(linha.score)) },
      });
    }
    return true;
  });

  if (!commitou) {
    const estadoReal = await buscarCompetition(id);
    if (estadoReal.status === 'FINISHED') return listarResultadosCompetition(id); // outra chamada já finalizou — idempotente
    throw new CompeticoesError('invalid_transition', `competição não está ACTIVE (estado atual: ${estadoReal.status})`);
  }

  const competicao = await buscarCompetition(id);
  if (competicao.seasonId) {
    for (const linha of ranking) {
      await registrarPontosSeason({
        seasonId: competicao.seasonId,
        participantType: competicao.participantType,
        participantId: linha.participantId,
        eventType: 'COMPETITION_RESULT',
        sourceType: 'COMPETITION',
        sourceId: id,
        points: Math.max(0, Math.round(linha.score)),
      });
    }
  }

  // Recompensa só pro 1º colocado, idempotente — nunca duplica mesmo se
  // finalizarCompetition for chamada de novo (early-return acima já cobre
  // isso, mas a idempotencyKey é uma 2ª camada de proteção, seção 27/38).
  // Usa DIRETAMENTE `competicao.rewardXp/rewardMoedas` (configurado por
  // competição, seção 13/26) — nunca a régua global de gamificação: régua
  // global é 1 valor pra TODO evento do mesmo tipo na empresa inteira,
  // incompatível com "cada competição define seu próprio prêmio".
  const vencedor = ranking[0];
  if (vencedor && competicao.participantType === 'SELLER') {
    const idempotencyKey = `competicao-${id}-vencedor`;
    const jaConcedida = (await prisma.xpTransacao.findUnique({ where: { idempotencyKey } })) || (await prisma.moedaTransacao.findUnique({ where: { idempotencyKey } }));
    if (!jaConcedida) {
      const vendedorVencedor = await prisma.vendedor.findUnique({ where: { id: vencedor.participantId } });
      if (vendedorVencedor) {
        const ctx = { empresaId: vendedorVencedor.empresaId, lojaId: vendedorVencedor.lojaId, vendedorId: vendedorVencedor.id, tipoEvento: 'COMPETICAO' as const, referenciaTipo: 'COMPETITION', referenciaId: id, idempotencyKey, regraVersao: 1, ocorridoEm: new Date() };
        if (competicao.rewardXp > 0) await concederXp(ctx, competicao.rewardXp);
        if (competicao.rewardMoedas > 0) await concederMoeda(ctx, competicao.rewardMoedas);
        if (competicao.rewardBadgeCodigo) await concederBadge(vendedorVencedor.empresaId, vendedorVencedor.lojaId, vendedorVencedor.id, competicao.rewardBadgeCodigo as CodigoBadge, idempotencyKey);
        await prisma.competitionResult.updateMany({ where: { competitionId: id, participantId: vencedor.participantId }, data: { rewardGranted: true } });
        await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_REWARD_GRANTED', actorId, metadata: { competitionId: id, vencedorId: vencedor.participantId } });
      }
    }
  }

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETITION_FINISHED', actorId, metadata: { competitionId: id, vencedorId: vencedor?.participantId } });

  if (vencedor && competicao.participantType === 'SELLER') {
    await publicarEventoFeed({
      eventType: 'COMPETITION_WON',
      sourceType: 'COMPETITION',
      sourceId: id,
      visibility: 'COMPANY',
      subjectId: vencedor.participantId,
      templateData: { competitionName: competicao.name },
    });
  }

  return listarResultadosCompetition(id);
}

export async function listarResultadosCompetition(competitionId: string) {
  return prisma.competitionResult.findMany({ where: { competitionId }, orderBy: { rank: 'asc' } });
}

export async function listarParticipantesCompetition(competitionId: string) {
  return prisma.competitionParticipant.findMany({ where: { competitionId } });
}

export async function listarMinhasCompetitionsElegiveis(vendedorId: string, agora: Date = new Date()) {
  return prisma.competitionParticipant.findMany({
    where: { participantType: 'SELLER', participantId: vendedorId, competicao: { status: { in: ['ACTIVE', 'SCHEDULED', 'FINISHED'] } } },
    include: { competicao: true },
    orderBy: { competicao: { startsAt: 'desc' } },
  });
}
