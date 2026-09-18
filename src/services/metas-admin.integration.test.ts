// Gestão de metas (Fatia 9.7, P0). Cobre o domínio novo E a política de
// histórico — meta de período encerrado é imutável porque a gamificação já
// foi concedida com base nela.
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { atualizarMeta, criarMeta, listarMetas, normalizarReferencia, removerMeta } from './metas-admin.service';
import { getProgressoVendedor } from './metas.service';

describe('Gestão de metas — Admin', () => {
  it('Admin cria meta e o vendedor passa a enxergá-la em /metas/minhas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();

    // Antes: nenhuma meta cadastrada.
    const antes = await getProgressoVendedor(vendedor.id, hoje);
    expect(antes.find((p) => p.periodo === 'DIA')!.metaFaturamento).toBeNull();

    await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hoje, valorMeta: 1500 },
      vendedor.empresaId,
      vendedor.id
    );

    const depois = await getProgressoVendedor(vendedor.id, hoje);
    expect(depois.find((p) => p.periodo === 'DIA')!.metaFaturamento).toBe(1500);
  });

  it('normaliza a referência pro início do período — meta criada às 14h é encontrada pela leitura, que busca 00h', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const meioDoDia = new Date();
    meioDoDia.setHours(14, 37, 12, 345);

    const meta = await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: meioDoDia, valorMeta: 900 },
      vendedor.empresaId,
      vendedor.id
    );

    expect(meta.referencia.getHours()).toBe(0);
    expect(meta.referencia.getMinutes()).toBe(0);
    // A leitura (que é quem o produto usa) encontra a meta.
    const progresso = await getProgressoVendedor(vendedor.id, meioDoDia);
    expect(progresso.find((p) => p.periodo === 'DIA')!.metaFaturamento).toBe(900);
  });

  it('empresaId e lojaId vêm SEMPRE do vendedor no banco, nunca do corpo da requisição', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    const meta = await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 500 },
      vendedor.empresaId,
      vendedor.id
    );

    expect(meta.empresaId).toBe(vendedor.empresaId);
    expect(meta.lojaId).toBe(vendedor.lojaId);
  });

  it('cross-company: Admin de uma empresa nunca cria meta pra vendedor de outra (404 genérico, não vaza existência)', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();

    await expect(
      criarMeta(
        { vendedorId: b.vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 1000 },
        a.vendedor.empresaId, // empresa do ADMIN A
        a.vendedor.id
      )
    ).rejects.toMatchObject({ type: 'vendedor_nao_encontrado', status: 404 });

    // Nada foi criado pro vendedor da empresa B.
    expect(await prisma.meta.count({ where: { vendedorId: b.vendedor.id } })).toBe(0);
  });

  it('duplicidade no mesmo vendedor/tipo/período é rejeitada com 409, nunca cria duas metas conflitantes', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    const entrada = { vendedorId: vendedor.id, tipo: 'FATURAMENTO' as const, periodo: 'DIA' as const, referencia: hoje, valorMeta: 1000 };

    await criarMeta(entrada, vendedor.empresaId, vendedor.id);
    await expect(criarMeta({ ...entrada, valorMeta: 2000 }, vendedor.empresaId, vendedor.id)).rejects.toMatchObject({ type: 'meta_duplicada' });

    expect(await prisma.meta.count({ where: { vendedorId: vendedor.id, periodo: 'DIA' } })).toBe(1);
  });

  it('meta do período corrente pode ser editada (o motor reavalia sozinho a cada sync)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const meta = await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 1000 },
      vendedor.empresaId,
      vendedor.id
    );

    const atualizada = await atualizarMeta(meta.id, 1250, vendedor.empresaId, vendedor.id);
    expect(Number(atualizada.valorMeta)).toBe(1250);
  });

  it('HISTÓRICO PROTEGIDO: meta de período já encerrado nunca é editada nem removida', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);

    // Criada "no passado" direto no banco — simula a meta que valeu ontem e já
    // gerou XP/moeda pelo motor de gamificação.
    const meta = await prisma.meta.create({
      data: {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId: vendedor.id,
        tipo: 'FATURAMENTO',
        periodo: 'DIA',
        referencia: normalizarReferencia('DIA', ontem),
        valorMeta: 800,
      },
    });

    await expect(atualizarMeta(meta.id, 999, vendedor.empresaId, vendedor.id)).rejects.toMatchObject({ type: 'meta_periodo_encerrado', status: 409 });
    await expect(removerMeta(meta.id, vendedor.empresaId, vendedor.id)).rejects.toMatchObject({ type: 'meta_periodo_encerrado' });

    // O valor histórico permanece exatamente como estava.
    const intacta = await prisma.meta.findUniqueOrThrow({ where: { id: meta.id } });
    expect(Number(intacta.valorMeta)).toBe(800);
  });

  it('criar meta pra período já encerrado também é bloqueado (não dá pra forjar histórico)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const semanaPassada = new Date();
    semanaPassada.setDate(semanaPassada.getDate() - 10);

    await expect(
      criarMeta(
        { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: semanaPassada, valorMeta: 700 },
        vendedor.empresaId,
        vendedor.id
      )
    ).rejects.toMatchObject({ type: 'meta_periodo_encerrado' });
  });

  it('remover meta do período corrente funciona e é auditado (caminho de correção de erro de cadastro)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const meta = await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 300 },
      vendedor.empresaId,
      vendedor.id
    );

    await removerMeta(meta.id, vendedor.empresaId, vendedor.id);
    expect(await prisma.meta.findUnique({ where: { id: meta.id } })).toBeNull();

    const auditoria = await prisma.auditEvent.findFirst({ where: { acao: 'GOAL_DELETED', targetId: vendedor.id } });
    expect(auditoria).not.toBeNull();
  });

  it('listagem resolve o nome do vendedor e marca o que ainda é editável', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarMeta(
      { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'MES', referencia: new Date(), valorMeta: 30000 },
      vendedor.empresaId,
      vendedor.id
    );

    const metas = await listarMetas({ empresaId: vendedor.empresaId, vendedorId: vendedor.id });
    expect(metas).toHaveLength(1);
    expect(metas[0].vendedorNome).toBe(vendedor.nome);
    expect(metas[0].editavel).toBe(true);
    expect(metas[0].valorMeta).toBe(30000);
  });

  it('listagem nunca devolve meta de outra empresa', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    await criarMeta(
      { vendedorId: b.vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 100 },
      b.vendedor.empresaId,
      b.vendedor.id
    );

    const metasDeA = await listarMetas({ empresaId: a.vendedor.empresaId });
    expect(metasDeA.every((m) => m.vendedorId !== b.vendedor.id)).toBe(true);
  });
});

describe('Meta comercial é só de quem vende (Fatia 9.7 — revisão de segurança)', () => {
  it('não cadastra meta comercial pra GERENTE nem pra ADMIN — regra vale na API, não só na tela', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    for (const papel of ['GERENTE', 'ADMIN'] as const) {
      await prisma.vendedor.update({ where: { id: vendedor.id }, data: { papel } });
      await expect(
        criarMeta(
          { vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(), valorMeta: 1000 },
          vendedor.empresaId,
          vendedor.id
        )
      ).rejects.toMatchObject({ type: 'papel_sem_meta_comercial', status: 409 });
    }

    expect(await prisma.meta.count({ where: { vendedorId: vendedor.id } })).toBe(0);
  });
});
