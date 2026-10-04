// Motor único de reconciliação (D4): o estado devido é recalculado dos fatos e
// o ledger acompanha — concede, estorna XP E VendaCoins, reconcede, sem nunca
// duplicar; conquistas e feed coerentes; sob concorrência, uma consequência.
import { describe, expect, it } from 'vitest';
import { prisma } from '../../db';
import { getSaldoMoedas, getTotalXp } from '../../gamificacao/ledger.service';
import { cancelamento, criarCenarioFase1, emLocal, item, venda } from '../test-helpers';
import { ingerirEventos } from '../vendas/ingestao.service';
import { calcularSequencia, reconciliarVendedor } from './motor';

const MES = '2026-10';
// meta mensal 3000 ÷ 30 dias previstos = meta diária 100,00
const cenario = () => criarCenarioFase1({ mes: MES, metaMensal: 3000, diasPrevistos: 30 });
const agoraEm = (dia: string, hora = '20:00') => new Date(emLocal(dia, hora));

async function vender(c: Awaited<ReturnType<typeof cenario>>, dia: string, valor: number, hora = '10:00') {
  const e = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(dia, hora), [item(valor)]);
  await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [e] });
  return e;
}

describe('Reconciliação — meta do dia (meta diária derivada: mensal ÷ dias previstos)', () => {
  it('venda que bate 120% concede os tiers 100/110/120 uma única vez, mesmo reconciliando de novo', async () => {
    const c = await cenario();
    await vender(c, '2026-10-14', 120);
    const r1 = await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(r1.concedidos).toEqual(expect.arrayContaining(['META_DIARIA_100', 'META_DIARIA_110', 'META_DIARIA_120']));
    expect(r1.concedidos).not.toContain('META_DIARIA_150');
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(await getTotalXp(c.vendedor.id)).toBe(100 + 30 + 50);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(50 + 20 + 30);
  });

  it('CANCELAMENTO estorna XP e VendaCoins dos tiers, revoga o feed e a conquista; repetir não estorna de novo', async () => {
    const c = await cenario();
    const v = await vender(c, '2026-10-14', 105);
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
    expect(await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', subjectId: c.vendedor.id, revogadoEm: null } })).toBe(1);
    expect(await prisma.badgeConcessao.count({ where: { vendedorId: c.vendedor.id, revogadoEm: null } })).toBe(1);

    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [cancelamento(v.idExterno, emLocal('2026-10-14', '18:00'))] });
    const r = await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(r.revertidos).toContain('META_DIARIA_100');
    expect(await getTotalXp(c.vendedor.id)).toBe(0);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(0);
    expect(await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', subjectId: c.vendedor.id, revogadoEm: null } })).toBe(0);
    expect(await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', subjectId: c.vendedor.id } })).toBe(1); // nunca apagado
    expect(await prisma.badgeConcessao.count({ where: { vendedorId: c.vendedor.id, revogadoEm: null } })).toBe(0);

    const reversoesAntes = await prisma.xpTransacao.count({ where: { vendedorId: c.vendedor.id, tipoEvento: 'REVERSAO' } });
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(await prisma.xpTransacao.count({ where: { vendedorId: c.vendedor.id, tipoEvento: 'REVERSAO' } })).toBe(reversoesAntes);
    // Histórico preservado: crédito original + estorno, nada apagado.
    expect(await prisma.xpTransacao.count({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'META_DIARIA_TIER' } })).toBe(2);
  });

  it('venda nova depois do estorno reconcede (nova geração) — saldo líquido sempre de UMA concessão', async () => {
    const c = await cenario();
    const v = await vender(c, '2026-10-14', 100);
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [cancelamento(v.idExterno, emLocal('2026-10-14', '12:00'))] });
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    await vender(c, '2026-10-14', 101, '15:00');
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(50);
    expect(await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', subjectId: c.vendedor.id, revogadoEm: null } })).toBe(1);
  });

  it('sem meta mensal ou sem dias previstos: nada é concedido (nunca inventa meta)', async () => {
    const c = await criarCenarioFase1({ mes: MES, metaMensal: 3000 });
    await vender(c, '2026-10-14', 900);
    await reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') });
    expect(await getTotalXp(c.vendedor.id)).toBe(0);
  });

  it('8 reconciliações concorrentes do mesmo dia: uma única concessão (trava por vendedor)', async () => {
    const c = await cenario();
    await vender(c, '2026-10-14', 100);
    await Promise.all(Array.from({ length: 8 }, () => reconciliarVendedor(c.vendedor.id, ['2026-10-14'], { agora: agoraEm('2026-10-14') })));
    expect(await prisma.moedaTransacao.count({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'META_DIARIA_TIER' } })).toBe(1);
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
  });
});

describe('Reconciliação — sequência de meta', () => {
  it('3 dias trabalhados seguidos com meta batida concede STREAK_3; cancelar uma venda do meio desfaz', async () => {
    const c = await cenario();
    const vendas = [];
    for (const dia of ['2026-10-12', '2026-10-13', '2026-10-14']) vendas.push(await vender(c, dia, 110));
    await reconciliarVendedor(c.vendedor.id, ['2026-10-12', '2026-10-13', '2026-10-14'], { agora: agoraEm('2026-10-14') });
    const streak = () => prisma.xpTransacao.aggregate({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'SEQUENCIA_META' }, _sum: { quantidade: true } });
    expect((await streak())._sum.quantidade).toBe(75);

    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [cancelamento(vendas[1].idExterno, emLocal('2026-10-15', '09:00'))] });
    await reconciliarVendedor(c.vendedor.id, ['2026-10-13'], { agora: agoraEm('2026-10-15', '10:00') });
    expect((await streak())._sum.quantidade).toBe(0);
  });

  it('regra pura: folga (dia sem venda) é neutra; dia trabalhado abaixo da meta quebra; hoje em andamento não quebra', () => {
    const d = (dia: string, faturamento: number, vendas = 1) => ({ dia, faturamento, vendas, pecas: vendas, pares: vendas, ticket: faturamento, pa: 1, meta: 100 });
    expect(calcularSequencia([d('2026-10-01', 120), d('2026-10-02', 0, 0), d('2026-10-03', 130)], '2026-10-10').atual).toBe(2);
    expect(calcularSequencia([d('2026-10-01', 120), d('2026-10-02', 50), d('2026-10-03', 130)], '2026-10-10').atual).toBe(1);
    expect(calcularSequencia([d('2026-10-01', 120), d('2026-10-02', 130), d('2026-10-03', 10)], '2026-10-03').atual).toBe(2);
  });
});
