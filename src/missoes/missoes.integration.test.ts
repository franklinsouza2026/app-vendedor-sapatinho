import { beforeAll, describe, expect, it } from 'vitest';
import { getMissoesAtivas, getHistoricoMissoes, getMissaoPorId, MissaoError } from './service';
import { avaliarMetaDiaria } from '../gamificacao/motor.service';
import { criarFixtureEmpresa, criarMeta, criarIndicador } from '../gamificacao/test-helpers';
import { garantirCatalogoMissoes } from './test-helpers';
import { prisma } from '../db';

beforeAll(async () => {
  await garantirCatalogoMissoes();
});

describe('getMissoesAtivas — atribuição + avaliação', () => {
  it('atribui até MISSOES_MAX_ATIVAS_POR_DIA missões e devolve estado ASSIGNED', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ativas = await getMissoesAtivas(vendedor.id);

    expect(ativas.length).toBeGreaterThan(0);
    expect(ativas.length).toBeLessThanOrEqual(3);
    for (const m of ativas) expect(['ASSIGNED', 'IN_PROGRESS']).toContain(m.status);
  });

  it('é idempotente: chamar de novo no mesmo dia não duplica atribuições', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const primeira = await getMissoesAtivas(vendedor.id);
    const segunda = await getMissoesAtivas(vendedor.id);

    expect(segunda.map((m) => m.id).sort()).toEqual(primeira.map((m) => m.id).sort());
    const total = await prisma.missionAssignment.count({ where: { vendedorId: vendedor.id } });
    expect(total).toBe(primeira.length);
  });

  it('conclui DAILY_GOAL e concede o bônus (0 por padrão — régua não configura MISSAO) exatamente uma vez', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));

    const antes = await getMissoesAtivas(vendedor.id);
    const dailyGoal = antes.find((m) => m.missao.code === 'DAILY_GOAL')!;
    expect(dailyGoal.status).toBe('ASSIGNED');

    await criarIndicador(vendedor.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });
    await avaliarMetaDiaria(vendedor.id, hoje);

    const depois = await getMissoesAtivas(vendedor.id);
    const dailyGoalDepois = depois.find((m) => m.missao.code === 'DAILY_GOAL')!;
    expect(dailyGoalDepois.status).toBe('COMPLETED');
    expect(dailyGoalDepois.completedAt).not.toBeNull();

    // Régua ativa não define XP/moeda pra MISSAO — bônus é 0 por padrão
    // (seção 20: "mission bonus só existe quando configurado"), mas a
    // CONCLUSÃO da missão nunca depende do bônus existir.
    const bonusKey = `missao-${dailyGoalDepois.id}`;
    const xp = await prisma.xpTransacao.findUnique({ where: { idempotencyKey: bonusKey } });
    const moeda = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey: bonusKey } });
    expect(xp).toBeNull();
    expect(moeda).toBeNull();

    // Reprocessar não reabre nem reprocessa a missão já concluída.
    await getMissoesAtivas(vendedor.id);
    const terceiraChamada = await getMissoesAtivas(vendedor.id);
    const aindaConcluida = terceiraChamada.find((m) => m.missao.code === 'DAILY_GOAL')!;
    expect(aindaConcluida.status).toBe('COMPLETED');
    expect(aindaConcluida.id).toBe(dailyGoalDepois.id);
  });

  it('concede bônus configurado quando a régua ativa define XP/moeda pra MISSAO', async () => {
    const { vendedor, empresa } = await criarFixtureEmpresa();
    await prisma.regraGamificacaoVersao.updateMany({ where: { empresaId: empresa.id }, data: { ativo: false } });
    const { REGUA_V1 } = await import('../gamificacao/regras.service');
    await prisma.regraGamificacaoVersao.create({
      data: {
        empresaId: empresa.id,
        versao: 2,
        ativo: true,
        regrasXp: { ...REGUA_V1.regrasXp, MISSAO: 15 },
        regrasMoeda: { ...REGUA_V1.regrasMoeda, MISSAO: 3 },
        pesosScore: REGUA_V1.pesosScore,
        criadoPor: 'test',
      },
    });

    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    await getMissoesAtivas(vendedor.id);
    await criarIndicador(vendedor.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });
    await avaliarMetaDiaria(vendedor.id, hoje);

    const depois = await getMissoesAtivas(vendedor.id);
    const dailyGoal = depois.find((m) => m.missao.code === 'DAILY_GOAL')!;
    expect(dailyGoal.status).toBe('COMPLETED');

    const xp = await prisma.xpTransacao.findUnique({ where: { idempotencyKey: `missao-${dailyGoal.id}` } });
    expect(xp?.quantidade).toBe(15);
  });
});

describe('getMissoesAtivas — concorrência', () => {
  it('chamadas concorrentes nunca concedem o bônus mais de uma vez pra mesma missão', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    await getMissoesAtivas(vendedor.id); // garante a atribuição antes da corrida
    await criarIndicador(vendedor.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });
    await avaliarMetaDiaria(vendedor.id, hoje);

    const resultados = await Promise.all(Array.from({ length: 8 }, () => getMissoesAtivas(vendedor.id)));

    for (const r of resultados) {
      const dailyGoal = r.find((m) => m.missao.code === 'DAILY_GOAL')!;
      expect(dailyGoal.status).toBe('COMPLETED');
    }
    const assignment = resultados[0].find((m) => m.missao.code === 'DAILY_GOAL')!;
    const transacoesXp = await prisma.xpTransacao.count({ where: { idempotencyKey: `missao-${assignment.id}` } });
    const transacoesMoeda = await prisma.moedaTransacao.count({ where: { idempotencyKey: `missao-${assignment.id}` } });
    expect(transacoesXp).toBeLessThanOrEqual(1);
    expect(transacoesMoeda).toBeLessThanOrEqual(1);
    const totalAssignments = await prisma.missionAssignment.count({ where: { vendedorId: vendedor.id, definicao: { code: 'DAILY_GOAL' } } });
    expect(totalAssignments).toBe(1); // nunca duplica a atribuição em corrida
  });
});

describe('não punir (seção 28)', () => {
  it('missão expirada nunca remove XP/moeda nem vira EXPIRED com penalidade', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ativas = await getMissoesAtivas(vendedor.id);
    const alvo = ativas[0];

    // Força expiração manualmente (simula o fim da janela do dia).
    await prisma.missionAssignment.update({ where: { id: alvo.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const saldoAntes = await prisma.moedaTransacao.count({ where: { vendedorId: vendedor.id } });
    const depois = await getMissoesAtivas(vendedor.id);
    const saldoDepois = await prisma.moedaTransacao.count({ where: { vendedorId: vendedor.id } });

    expect(saldoDepois).toBe(saldoAntes); // nunca debita nada
    // A missão expirada não aparece mais como "ativa" (fica fora de ASSIGNED/IN_PROGRESS do dia)
    expect(depois.find((m) => m.id === alvo.id)?.status).not.toBe('ASSIGNED');
  });
});

describe('IDOR / tenant isolation', () => {
  it('vendedor B não consegue ver a missão de A por getMissaoPorId (not_found, não revela existência)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const ativasA = await getMissoesAtivas(vendedorA.id);

    await expect(getMissaoPorId(ativasA[0].id, vendedorB.id)).rejects.toMatchObject({ type: 'not_found' } satisfies Partial<MissaoError>);
  });

  it('histórico de um vendedor nunca inclui missões de outro', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedorA.id, 1000, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    await getMissoesAtivas(vendedorA.id);
    await criarIndicador(vendedorA.id, hoje, { faturamento: 1000, ticketMedio: 100, pa: 2 });
    await avaliarMetaDiaria(vendedorA.id, hoje);
    await getMissoesAtivas(vendedorA.id);

    const historicoB = await getHistoricoMissoes(vendedorB.id);
    expect(historicoB).toHaveLength(0);
  });

  it('missões de uma empresa nunca aparecem pra vendedor de outra (catálogo é global, atribuição é por vendedor)', async () => {
    const { vendedor: vendedorEmpresaA } = await criarFixtureEmpresa();
    const { vendedor: vendedorEmpresaB } = await criarFixtureEmpresa();

    const ativasA = await getMissoesAtivas(vendedorEmpresaA.id);
    const ativasB = await getMissoesAtivas(vendedorEmpresaB.id);

    const idsA = new Set(ativasA.map((m) => m.id));
    const idsB = new Set(ativasB.map((m) => m.id));
    for (const id of idsB) expect(idsA.has(id)).toBe(false);
  });
});
