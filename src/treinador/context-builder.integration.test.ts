import { describe, expect, it } from 'vitest';
import { buildTrainerContext } from './context-builder.service';
import { criarPlaybookDraft, publicarPlaybook } from './playbook.service';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from '../gamificacao/test-helpers';
import { inicioDoDia } from '../services/metas.service';

describe('buildTrainerContext', () => {
  it('monta contexto correto a partir dos dados reais do vendedor', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 700, ticketMedio: 100, pa: 2, numAtendimentos: 7 });

    const { context: ctx } = await buildTrainerContext(vendedor.id, { mode: 'GERAL' });

    expect(ctx.seller.displayName).toBe(vendedor.nome);
    expect(ctx.store.name).toBe(loja.nome);
    expect(ctx.performance.ticket).toBe(100);
    expect(ctx.performance.pa).toBe(2);
    expect(ctx.performance.goalPercent).toBe(70);
    expect(ctx.baseline.pa).toBeNull(); // sem histórico ainda (em formação)
    expect(ctx.request.mode).toBe('GERAL');
  });

  it('inclui a objeção e a situação passadas na requisição', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { context: ctx } = await buildTrainerContext(vendedor.id, { mode: 'OBJECAO', objection: 'Está caro', situation: 'cliente já negociou antes' });

    expect(ctx.request.objection).toBe('Está caro');
    expect(ctx.request.situation).toBe('cliente já negociou antes');
  });

  it('sem playbook publicado, version é null e não há seções (nunca inventa conteúdo)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { context: ctx, playbookId } = await buildTrainerContext(vendedor.id, { mode: 'ABORDAGEM' });

    expect(ctx.playbook.version).toBeNull();
    expect(ctx.playbook.relevantSections).toEqual([]);
    expect(playbookId).toBeNull();
  });

  it('com playbook publicado, traz só as seções da categoria do modo pedido', async () => {
    const { vendedor, empresa } = await criarFixtureEmpresa();
    const draft = await criarPlaybookDraft(empresa.id, 'Playbook Teste', [
      { categoria: 'ABORDAGEM', titulo: 'Recepção', conteudo: 'Receba com sorriso.', origem: 'OFICIAL' },
      { categoria: 'OBJECOES', titulo: 'Objeção genérica', conteudo: 'Reconheça e investigue.', origem: 'DEMONSTRATIVO' },
    ]);
    await publicarPlaybook(draft.id, empresa.id, 'tester');

    const { context: ctx, playbookId } = await buildTrainerContext(vendedor.id, { mode: 'ABORDAGEM' });

    expect(playbookId).toBe(draft.id);
    expect(ctx.playbook.version).toBe(1);
    expect(ctx.playbook.relevantSections.map((s) => s.title)).toEqual(['Recepção']);
    expect(ctx.playbook.relevantSections[0].origin).toBe('OFICIAL');
  });

  it('nunca vaza dado de outro vendedor/empresa (isolamento estrutural)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB, empresa: empresaB } = await criarFixtureEmpresa();
    await criarMeta(vendedorB.id, 5000, inicioDoDia(new Date()));
    const draftB = await criarPlaybookDraft(empresaB.id, 'Playbook B', [
      { categoria: 'ABORDAGEM', titulo: 'Segredo da empresa B', conteudo: 'conteúdo privado', origem: 'OFICIAL' },
    ]);
    await publicarPlaybook(draftB.id, empresaB.id, 'tester');

    const { context: ctxA } = await buildTrainerContext(vendedorA.id, { mode: 'ABORDAGEM' });

    expect(ctxA.seller.displayName).toBe(vendedorA.nome);
    expect(ctxA.playbook.version).toBeNull(); // playbook de B não vaza pra A
    expect(JSON.stringify(ctxA)).not.toContain('Segredo da empresa B');
  });
});
