import { describe, expect, it } from 'vitest';
import { calcularGastoMensalUSD, verificarBudgetMensal, verificarRateLimitDiario } from './limites.service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';
import { env } from '../config';

describe('verificarRateLimitDiario', () => {
  it('usa o limite padrão de env quando a empresa não tem AIBudgetConfig', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.permitido).toBe(true);
    expect(status.limite).toBe(env.AI_DAILY_MESSAGE_LIMIT_DEFAULT);
    expect(status.usadoHoje).toBe(0);
  });

  it('usa o limite configurado da empresa quando existe AIBudgetConfig', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({
      data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 5, dailyMessageLimitPerSeller: 2, updatedBy: 'test' },
    });

    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.limite).toBe(2);
  });

  it('bloqueia quando o vendedor já atingiu o limite diário de mensagens', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({
      data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 5, dailyMessageLimitPerSeller: 1, updatedBy: 'test' },
    });

    const conversa = await prisma.coachConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id },
    });
    await prisma.coachMessage.create({ data: { conversationId: conversa.id, role: 'USER', content: 'oi' } });

    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.permitido).toBe(false);
    expect(status.usadoHoje).toBe(1);
  });
});

describe('verificarBudgetMensal', () => {
  it('calcula o gasto do mês como soma real do AIUsage — nunca contador mutável', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIUsage.createMany({
      data: [
        { empresaId: vendedor.empresaId, vendedorId: vendedor.id, provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 1.5, status: 'SUCESSO' },
        { empresaId: vendedor.empresaId, vendedorId: vendedor.id, provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 2.25, status: 'SUCESSO' },
      ],
    });

    expect(await calcularGastoMensalUSD(vendedor.empresaId)).toBe(3.75);
  });

  it('bloqueia quando o gasto do mês atinge o limite configurado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({
      data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 1, dailyMessageLimitPerSeller: 20, updatedBy: 'test' },
    });
    await prisma.aIUsage.create({
      data: { empresaId: vendedor.empresaId, vendedorId: vendedor.id, provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 1, status: 'SUCESSO' },
    });

    const status = await verificarBudgetMensal(vendedor.empresaId);
    expect(status.permitido).toBe(false);
    expect(status.percentualUsado).toBe(100);
  });

  it('gasto de meses anteriores não conta pro mês atual', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const mesPassado = new Date();
    mesPassado.setMonth(mesPassado.getMonth() - 1);

    await prisma.aIUsage.create({
      data: {
        empresaId: vendedor.empresaId,
        vendedorId: vendedor.id,
        provider: 'anthropic',
        model: 'claude-opus-5',
        estimatedCostUSD: 999,
        status: 'SUCESSO',
        createdAt: mesPassado,
      },
    });

    expect(await calcularGastoMensalUSD(vendedor.empresaId)).toBe(0);
  });
});
