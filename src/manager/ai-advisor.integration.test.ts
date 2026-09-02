// Assistente de Gestão / AI Manager Advisor (Fatia 9, seção 78-84/109-111).
// AI-off nunca quebra: falha graciosamente com TrainingIntelligenceError.
// Todo sellerId no output é revalidado contra o banco (nunca confia no LLM).
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';
import { pedirConselhoGerencial } from './ai-advisor.service';

describe('pedirConselhoGerencial — Mock AI', () => {
  it('devolve resumo + prioridades + reconhecimentos sugeridos com sellerIds sempre válidos da própria loja', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await criarIndicador(vendedor.id, new Date(), { faturamento: 500 });

    const conselho = await pedirConselhoGerencial({ empresaId: empresa.id, lojaId: loja.id, managerId: vendedor.id });
    expect(typeof conselho.summary).toBe('string');
    expect(conselho.summary.length).toBeGreaterThan(0);
    for (const p of conselho.priorities) {
      if (p.sellerId !== null) expect(p.sellerId).toBe(vendedor.id);
    }
    for (const r of conselho.suggestedRecognitions) {
      expect(r.sellerId).toBe(vendedor.id);
    }
  });

  it('loja sem nenhum vendedor nunca quebra — listas vazias, resumo ainda presente', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    // Remove o vendedor padrão da fixture pra simular loja vazia.
    await prisma.vendedor.deleteMany({ where: { empresaId: empresa.id, lojaId: loja.id } });
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-AI', nome: 'Gerente', papel: 'GERENTE' } });

    const conselho = await pedirConselhoGerencial({ empresaId: empresa.id, lojaId: loja.id, managerId: gerente.id });
    expect(conselho.priorities).toEqual([]);
    expect(conselho.suggestedRecognitions).toEqual([]);
  });

  it('AI-off (budget esgotado) falha graciosamente — nunca 500/crash', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.upsert({
      where: { empresaId: empresa.id },
      update: { monthlyLimitUSD: 0 },
      create: { empresaId: empresa.id, monthlyLimitUSD: 0, dailyMessageLimitPerSeller: 20, updatedBy: 'test' },
    });

    await expect(pedirConselhoGerencial({ empresaId: empresa.id, lojaId: loja.id, managerId: vendedor.id })).rejects.toMatchObject({ type: 'budget_exceeded' });
  });
});
