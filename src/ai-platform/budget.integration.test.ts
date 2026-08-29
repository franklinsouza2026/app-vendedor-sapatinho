// Budget é compartilhado por todos os especialistas (Coach, Treinador, ...) —
// testado aqui, na ai-platform, não dentro de um módulo de especialista
// específico.
import { describe, expect, it } from 'vitest';
import { calcularGastoMensalUSD, verificarBudgetMensal } from './budget.service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

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

  it('soma o custo de todos os especialistas (Coach + Treinador) no mesmo budget da empresa', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIUsage.createMany({
      data: [
        { empresaId: vendedor.empresaId, vendedorId: vendedor.id, specialist: 'COACH', provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 1, status: 'SUCESSO' },
        { empresaId: vendedor.empresaId, vendedorId: vendedor.id, specialist: 'TRAINER', provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 1, status: 'SUCESSO' },
      ],
    });

    expect(await calcularGastoMensalUSD(vendedor.empresaId)).toBe(2);
  });
});
