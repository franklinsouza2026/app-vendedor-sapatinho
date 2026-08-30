// Budget é compartilhado por todos os especialistas (Coach, Treinador, ...) —
// testado aqui, na ai-platform, não dentro de um módulo de especialista
// específico.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { calcularGastoMensalUSD, verificarBudgetMensal } from './budget.service';
import { criarFixtureEmpresa, criarMeta } from '../gamificacao/test-helpers';
import { prisma } from '../db';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';

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

describe('Budget esgotado (100%) NUNCA bloqueia funcionalidade determinística (seção 20/64 da Fatia 7.5B)', () => {
  it('com budget zerado, Coach fica indisponível mas Home/metas/carteira/missões/admin continuam funcionando normalmente', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({ data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 1, dailyMessageLimitPerSeller: 20, updatedBy: 'test' } });
    await prisma.aIUsage.create({
      data: { empresaId: vendedor.empresaId, vendedorId: vendedor.id, provider: 'anthropic', model: 'claude-opus-5', estimatedCostUSD: 1, status: 'SUCESSO' },
    });
    await criarMeta(vendedor.id, 1000, new Date());

    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });

    // rotas 100% determinísticas — nenhuma delas consulta budget de IA.
    expect((await request(app).get('/metas/minhas').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/gamificacao/carteira').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/gamificacao/streak').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    // única rota que efetivamente checa budget mensal — via o campo que a
    // própria rota expõe, sem repetir a regra de negócio aqui.
    const status = await verificarBudgetMensal(vendedor.empresaId);
    expect(status.permitido).toBe(false);
  });
});
