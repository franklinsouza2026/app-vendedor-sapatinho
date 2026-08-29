import { describe, expect, it } from 'vitest';
import { buildCoachContext } from './context-builder.service';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from '../gamificacao/test-helpers';
import { inicioDoDia } from '../services/metas.service';

describe('buildCoachContext', () => {
  it('monta contexto correto a partir dos dados reais do vendedor', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 700, ticketMedio: 100, pa: 2, numAtendimentos: 7 });

    const ctx = await buildCoachContext(vendedor.id);

    expect(ctx.seller.displayName).toBe(vendedor.nome);
    expect(ctx.store.name).toBe(loja.nome);
    expect(ctx.goal.todayGoal).toBe(1000);
    expect(ctx.goal.realized).toBe(700);
    expect(ctx.goal.amountRemaining).toBe(300);
    expect(ctx.goal.estimatedSalesRemaining).toBe(3); // ceil(300/100)
    expect(ctx.performance.ticket).toBe(100);
    expect(ctx.performance.pa).toBe(2);
    expect(ctx.gamification.xp).toBe(0);
    expect(ctx.baseline.status).toBe('em_formacao'); // sem histórico ainda
  });

  it('nunca vaza dado de outro vendedor (isolamento estrutural — sempre resolve pelo id passado)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    await criarMeta(vendedorB.id, 5000, inicioDoDia(new Date()));

    const ctxA = await buildCoachContext(vendedorA.id);

    expect(ctxA.seller.displayName).toBe(vendedorA.nome);
    expect(ctxA.goal.todayGoal).not.toBe(5000); // meta de B não vaza pro contexto de A
  });

  it('lida com ausência total de dados sem quebrar', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ctx = await buildCoachContext(vendedor.id);

    expect(ctx.goal.todayGoal).toBeNull();
    expect(ctx.goal.amountRemaining).toBeNull();
    expect(ctx.freshness.lastDataSyncAt).toBeNull();
    expect(ctx.gamification.recentBadges).toEqual([]);
  });
});
