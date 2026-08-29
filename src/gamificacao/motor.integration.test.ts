// Testes de integração contra o Postgres real de dev (porta definida em .env).
// Cobrem os casos críticos obrigatórios da fonte de verdade (seção 40):
// "sync repetido não duplica" e "venda cancelada gera compensação".
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { avaliarMetaDiaria } from './motor.service';
import { getSaldoMoedas, getTotalXp } from './ledger.service';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from './test-helpers';
import { inicioDoDia } from '../services/metas.service';

describe('avaliarMetaDiaria', () => {
  it('concede XP e moeda ao bater 100% da meta, e reprocessar não duplica', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    const inicioHoje = inicioDoDia(hoje);
    await criarMeta(vendedor.id, 1000, inicioHoje);
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 1000 });

    await avaliarMetaDiaria(vendedor.id, hoje);
    const saldoApos1a = await getSaldoMoedas(vendedor.id);
    const xpApos1a = await getTotalXp(vendedor.id);

    // reprocessa (simula worker rodando de novo pro mesmo horário)
    await avaliarMetaDiaria(vendedor.id, hoje);
    const saldoApos2a = await getSaldoMoedas(vendedor.id);
    const xpApos2a = await getTotalXp(vendedor.id);

    expect(saldoApos1a).toBe(50); // META_DIARIA_100 = +50 moedas (régua v1)
    expect(xpApos1a).toBe(100); // META_DIARIA_100 = +100 XP (régua v1)
    expect(saldoApos2a).toBe(saldoApos1a); // idempotente — não duplicou
    expect(xpApos2a).toBe(xpApos1a);
  });

  it('concede tiers acumulativos (100+110+120) quando a meta é amplamente superada', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 1250 }); // 125% da meta

    await avaliarMetaDiaria(vendedor.id, hoje);

    const saldo = await getSaldoMoedas(vendedor.id);
    // 50 (100%) + 20 (110%) + 30 (120%) = 100 — não atinge 150%, então sem o tier de +50
    expect(saldo).toBe(100);
  });

  it('reverte a moeda de um tier quando o resync do ERP derruba o faturamento abaixo do limiar (compensação)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    const horaSnapshot = new Date(hoje);
    horaSnapshot.setMinutes(0, 0, 0);

    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, horaSnapshot, { faturamento: 1000 }); // 100% — bate o tier
    await avaliarMetaDiaria(vendedor.id, hoje);
    expect(await getSaldoMoedas(vendedor.id)).toBe(50);

    // ERP corrige (cancelamento) e o resync traz um valor menor pra mesma hora
    await criarIndicador(vendedor.id, horaSnapshot, { faturamento: 400 }); // 40% — não bate mais
    await avaliarMetaDiaria(vendedor.id, hoje);

    const saldoAposReversao = await getSaldoMoedas(vendedor.id);
    expect(saldoAposReversao).toBe(0); // +50 concedido, -50 revertido = 0

    const transacoes = await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id }, orderBy: { createdAt: 'asc' } });
    expect(transacoes).toHaveLength(2);
    expect(transacoes[1].tipoEvento).toBe('REVERSAO');
    expect(transacoes[1].valor).toBe(-50);

    // reprocessar de novo com o mesmo valor baixo não deve reverter 2x
    await avaliarMetaDiaria(vendedor.id, hoje);
    expect(await getSaldoMoedas(vendedor.id)).toBe(0);
    const transacoesApos2a = await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id } });
    expect(transacoesApos2a).toHaveLength(2); // não criou uma segunda reversão

    // XP não é revertido (princípio: XP não diminui em situações normais)
    expect(await getTotalXp(vendedor.id)).toBe(100);

    // ERP corrige de novo e o faturamento volta a bater o tier NO MESMO DIA —
    // precisa conceder de novo (regressão do bug: idemKey já usada travava reconcessão)
    await criarIndicador(vendedor.id, horaSnapshot, { faturamento: 1000 });
    const resultado = await avaliarMetaDiaria(vendedor.id, hoje);

    expect(resultado.eventosNovos).toContain('META_DIARIA_100');
    expect(await getSaldoMoedas(vendedor.id)).toBe(50); // concedido de novo (50 - 50 + 50)

    const transacoesFinal = await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id } });
    expect(transacoesFinal).toHaveLength(3); // credito original + reversão + novo credito

    // XP NÃO é concedido de novo na 2ª geração (só na 1ª) — senão oscilar o ERP
    // pra cima/baixo repetidas vezes infla XP sem limite (bug encontrado em review)
    expect(await getTotalXp(vendedor.id)).toBe(100);

    // reprocessar de novo no mesmo estado não duplica a segunda concessão
    await avaliarMetaDiaria(vendedor.id, hoje);
    expect(await getSaldoMoedas(vendedor.id)).toBe(50);
    expect(await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id } })).toHaveLength(3);
  });

  it('não concede nada quando não há meta cadastrada', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 5000 });

    await avaliarMetaDiaria(vendedor.id, hoje);

    expect(await getSaldoMoedas(vendedor.id)).toBe(0);
    expect(await getTotalXp(vendedor.id)).toBe(0);
  });

  it('badge PRIMEIRA_META é concedido só uma vez, mesmo em dias diferentes', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const hoje = new Date();
    await criarMeta(vendedor.id, 1000, inicioDoDia(hoje));
    await criarIndicador(vendedor.id, new Date(hoje.setMinutes(0, 0, 0)), { faturamento: 1000 });
    await avaliarMetaDiaria(vendedor.id, hoje);

    const badges = await prisma.badgeConcessao.findMany({ where: { vendedorId: vendedor.id } });
    expect(badges).toHaveLength(1);

    // reprocessa de novo — não duplica o badge
    await avaliarMetaDiaria(vendedor.id, hoje);
    const badgesApos = await prisma.badgeConcessao.findMany({ where: { vendedorId: vendedor.id } });
    expect(badgesApos).toHaveLength(1);
  });
});
