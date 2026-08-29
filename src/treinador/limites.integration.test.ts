import { describe, expect, it } from 'vitest';
import { verificarRateLimitDiario } from './limites.service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';
import { env } from '../config';

describe('verificarRateLimitDiario (Treinador)', () => {
  it('usa o limite padrão de env quando a empresa não tem AIBudgetConfig', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.permitido).toBe(true);
    expect(status.limite).toBe(env.AI_DAILY_MESSAGE_LIMIT_DEFAULT);
    expect(status.usadoHoje).toBe(0);
  });

  it('bloqueia quando o vendedor já atingiu o limite diário de mensagens do Treinador', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({
      data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 5, dailyMessageLimitPerSeller: 1, updatedBy: 'test' },
    });

    const conversa = await prisma.trainerConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id },
    });
    await prisma.trainerMessage.create({ data: { conversationId: conversa.id, role: 'USER', content: 'oi' } });

    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.permitido).toBe(false);
    expect(status.usadoHoje).toBe(1);
  });

  it('mensagens do Coach não contam pro limite diário do Treinador (contadores independentes)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.create({
      data: { empresaId: vendedor.empresaId, monthlyLimitUSD: 5, dailyMessageLimitPerSeller: 1, updatedBy: 'test' },
    });

    const conversaCoach = await prisma.coachConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id },
    });
    await prisma.coachMessage.create({ data: { conversationId: conversaCoach.id, role: 'USER', content: 'oi coach' } });

    const status = await verificarRateLimitDiario(vendedor.id, vendedor.empresaId);
    expect(status.permitido).toBe(true);
    expect(status.usadoHoje).toBe(0);
  });
});
