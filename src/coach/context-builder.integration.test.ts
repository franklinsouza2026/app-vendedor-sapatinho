import { describe, expect, it } from 'vitest';
import { buildCoachContext } from './context-builder.service';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from '../gamificacao/test-helpers';
import { inicioDoDia } from '../services/metas.service';
import { decidirPertinencia } from '../pertinencia/gate.service';

// Etapa 2B.1: o builder passou a receber a decisão de pertinência e a carregar
// só os domínios autorizados. Estes testes usam a intenção que libera o bloco
// comercial — a prova de que ele NÃO é carregado nas outras intenções está em
// `pessoa-primeiro.integration.test.ts`.
const COMERCIAL_LIBERADO = decidirPertinencia('DUVIDA_COMERCIAL', null, 'DETERMINISTICO');

describe('buildCoachContext', () => {
  it('monta contexto correto a partir dos dados reais do vendedor', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 700, ticketMedio: 100, pa: 2, numAtendimentos: 7 });

    const ctx = await buildCoachContext(vendedor.id, COMERCIAL_LIBERADO);

    expect(ctx.seller.displayName).toBe(vendedor.nome);
    expect(ctx.store.name).toBe(loja.nome);
    expect(ctx.comercial!.goal.todayGoal).toBe(1000);
    expect(ctx.comercial!.goal.realized).toBe(700);
    expect(ctx.comercial!.goal.amountRemaining).toBe(300);
    expect(ctx.comercial!.goal.estimatedSalesRemaining).toBe(3); // ceil(300/100)
    expect(ctx.comercial!.performance.ticket).toBe(100);
    expect(ctx.comercial!.performance.pa).toBe(2);
    expect(ctx.comercial!.gamification.xp).toBe(0);
    expect(ctx.comercial!.baseline.status).toBe('em_formacao'); // sem histórico ainda
  });

  it('nunca vaza dado de outro vendedor (isolamento estrutural — sempre resolve pelo id passado)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    await criarMeta(vendedorB.id, 5000, inicioDoDia(new Date()));

    const ctxA = await buildCoachContext(vendedorA.id, COMERCIAL_LIBERADO);

    expect(ctxA.seller.displayName).toBe(vendedorA.nome);
    expect(ctxA.comercial!.goal.todayGoal).not.toBe(5000); // meta de B não vaza pro contexto de A
  });

  it('lida com ausência total de dados sem quebrar', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ctx = await buildCoachContext(vendedor.id, COMERCIAL_LIBERADO);

    expect(ctx.comercial!.goal.todayGoal).toBeNull();
    expect(ctx.comercial!.goal.amountRemaining).toBeNull();
    expect(ctx.freshness.lastDataSyncAt).toBeNull();
    expect(ctx.comercial!.gamification.recentBadges).toEqual([]);
  });

  it('em ACOLHER, o bloco comercial não é NEM CARREGADO — não é filtro de exibição', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarMeta(vendedor.id, 5000, inicioDoDia(new Date()));

    const ctx = await buildCoachContext(vendedor.id, decidirPertinencia('DESABAFO', 'NOT_GOOD', 'DETERMINISTICO'));

    expect(ctx.comercial).toBeNull();
    expect(ctx.desenvolvimento).toBeNull();
    // O bloco humano continua — a pessoa nunca é o que se corta.
    expect(ctx.humano).toBeDefined();
  });
});
