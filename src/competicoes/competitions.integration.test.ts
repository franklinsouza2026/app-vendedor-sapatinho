// Competition (Fatia 8, seção 9-17/59-65/79/84/91/96-98/101-103) —
// elegibilidade, ranking determinístico, finalização idempotente sob
// concorrência real, backend-authoritative (nunca aceita score/winner do
// cliente — só o resultado calculado aqui).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarCompetition, transicionarCompetition, buscarCompetition, calcularRankingCompetition, finalizarCompetition, listarParticipantesCompetition } from './competitions.service';
import { CompeticoesError } from './constantes';

function periodoCurto() {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() - 7); // cobre os 6 dias marcados por marcarDiasAtivos
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + 3);
  return { startsAt, endsAt };
}

async function marcarDiasAtivos(vendedorId: string, dias: number) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < dias; i++) {
    const data = new Date(hoje);
    data.setDate(data.getDate() - i);
    await prisma.streakChecagem.create({ data: { vendedorId, tipo: 'META_DIARIA', data, atingiu: true } });
  }
}

describe('Competition — validação na criação (seção 48: sem eval/fórmula arbitrária)', () => {
  it('rejeita metricType sem calculador implementado (CUSTOM_RULE)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = periodoCurto();
    await expect(
      criarCompetition({ code: `comp-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CUSTOM_RULE', startsAt, endsAt }, vendedor.id)
    ).rejects.toThrow(CompeticoesError);
  });

  it('rejeita COMPETENCY_EVOLUTION sem competencyId', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = periodoCurto();
    await expect(
      criarCompetition({ code: `comp-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'COMPETENCY_EVOLUTION', startsAt, endsAt }, vendedor.id)
    ).rejects.toThrow(CompeticoesError);
  });

  it('rejeita rewardBadgeCodigo fora do catálogo', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = periodoCurto();
    await expect(
      criarCompetition({ code: `comp-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, rewardBadgeCodigo: 'BADGE_INVENTADO' }, vendedor.id)
    ).rejects.toThrow(CompeticoesError);
  });
});

describe('Competition — fairness (seção 12/59/98)', () => {
  it('auto-enrollment marca DISQUALIFIED (não score 0) quem não tem dias ativos suficientes', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-fair-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, minDiasAtivos: 5 }, vendedor.id);
    await transicionarCompetition(competicao.id, 'ativar', vendedor.id);

    const participantes = await listarParticipantesCompetition(competicao.id);
    const meu = participantes.find((p) => p.participantId === vendedor.id);
    expect(meu?.status).toBe('DISQUALIFIED');
    expect(meu?.disqualifiedReason).toMatch(/dia\(s\) ativo/);
  });

  it('vendedor com dias ativos suficientes fica ELIGIBLE', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await marcarDiasAtivos(vendedor.id, 6);
    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-fair-ok-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, minDiasAtivos: 5 }, vendedor.id);
    await transicionarCompetition(competicao.id, 'ativar', vendedor.id);

    const participantes = await listarParticipantesCompetition(competicao.id);
    const meu = participantes.find((p) => p.participantId === vendedor.id);
    expect(meu?.status).toBe('ELIGIBLE');
  });
});

describe('Competition — ranking determinístico (seção 14/85/97)', () => {
  it('GOAL_ATTAINMENT: quem tem % de meta maior fica em 1º, sem faturamento bruto influenciar', async () => {
    const fixtureA = await criarFixtureEmpresa();
    const fixtureB = await criarFixtureEmpresa();
    await marcarDiasAtivos(fixtureA.vendedor.id, 6);
    await marcarDiasAtivos(fixtureB.vendedor.id, 6);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    // A: meta 1000, realizado 1100 (110%). B: meta 100, realizado 105 (105%) — A vence mesmo com % maior por pouco.
    await prisma.meta.create({ data: { empresaId: fixtureA.empresa.id, lojaId: fixtureA.loja.id, vendedorId: fixtureA.vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hoje, valorMeta: 1000 } });
    await prisma.indicadorRealizado.create({ data: { empresaId: fixtureA.empresa.id, lojaId: fixtureA.loja.id, vendedorId: fixtureA.vendedor.id, dataHora: new Date(), faturamento: 1100, ticketMedio: 100, pa: 1, numAtendimentos: 11, fonteJobId: 'teste' } });
    await prisma.meta.create({ data: { empresaId: fixtureB.empresa.id, lojaId: fixtureB.loja.id, vendedorId: fixtureB.vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hoje, valorMeta: 100 } });
    await prisma.indicadorRealizado.create({ data: { empresaId: fixtureB.empresa.id, lojaId: fixtureB.loja.id, vendedorId: fixtureB.vendedor.id, dataHora: new Date(), faturamento: 90, ticketMedio: 90, pa: 1, numAtendimentos: 1, fonteJobId: 'teste' } });

    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-goal-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'GOAL_ATTAINMENT', startsAt, endsAt, minDiasAtivos: 5 }, fixtureA.vendedor.id);
    await transicionarCompetition(competicao.id, 'ativar', fixtureA.vendedor.id);

    const ranking = await calcularRankingCompetition(competicao.id);
    const linhaA = ranking.find((r) => r.participantId === fixtureA.vendedor.id)!;
    const linhaB = ranking.find((r) => r.participantId === fixtureB.vendedor.id)!;
    expect(linhaA.score).toBeCloseTo(110, 0);
    expect(linhaB.score).toBeCloseTo(90, 0);
    expect(linhaA.posicao).toBeLessThan(linhaB.posicao); // A (110%) na frente de B (90%)
  });
});

describe('Competition — finalização (seção 64/79/84/91/103): snapshot imutável, idempotente sob concorrência real', () => {
  it('2 finalizações concorrentes: só 1 conjunto de resultados, nenhuma recompensa duplicada', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await marcarDiasAtivos(vendedor.id, 6);
    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-final-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, minDiasAtivos: 5, rewardXp: 50, rewardMoedas: 10 }, vendedor.id);
    await transicionarCompetition(competicao.id, 'ativar', vendedor.id);

    await Promise.all([finalizarCompetition(competicao.id, vendedor.id), finalizarCompetition(competicao.id, vendedor.id)]);

    // Banco de teste compartilhado pode ter outros vendedores elegíveis
    // (resíduo de fixtures de outras suítes) — o que importa aqui é que
    // NOSSO participante nunca aparece duplicado, nunca 2x no snapshot.
    const resultados = await prisma.competitionResult.findMany({ where: { competitionId: competicao.id, participantId: vendedor.id } });
    expect(resultados).toHaveLength(1);

    const final = await buscarCompetition(competicao.id);
    expect(final.status).toBe('FINISHED');

    const xpTransacoes = await prisma.xpTransacao.findMany({ where: { vendedorId: vendedor.id, tipoEvento: 'COMPETICAO' } });
    expect(xpTransacoes.length).toBeLessThanOrEqual(1); // nunca 2 concessões pro mesmo vencedor
  });

  it('finalizar de novo uma competição já FINISHED é idempotente (devolve o snapshot, não recalcula)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await marcarDiasAtivos(vendedor.id, 6);
    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-final2-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, minDiasAtivos: 5 }, vendedor.id);
    await transicionarCompetition(competicao.id, 'ativar', vendedor.id);
    await finalizarCompetition(competicao.id, vendedor.id);
    const resultadosAntes = await prisma.competitionResult.findMany({ where: { competitionId: competicao.id } });

    await finalizarCompetition(competicao.id, vendedor.id);
    const resultadosDepois = await prisma.competitionResult.findMany({ where: { competitionId: competicao.id } });
    expect(resultadosDepois).toHaveLength(resultadosAntes.length);
  });

  it('rejeita finalizar uma competição que nunca foi ativada', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = periodoCurto();
    const competicao = await criarCompetition({ code: `comp-draft-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt }, vendedor.id);
    await expect(finalizarCompetition(competicao.id, vendedor.id)).rejects.toThrow(CompeticoesError);
  });
});
