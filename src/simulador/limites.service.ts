// Rate limit diário por vendedor do Simulador — conta SimulationMessage
// (role VENDEDOR), independente de CoachMessage/TrainerMessage (mesma
// decisão documentada da Fatia 5: cada especialista tem sua própria cota
// diária; o budget mensal em dólares, esse sim, é somado entre todos em
// src/ai-platform/budget.service.ts).
import { prisma } from '../db';
import { inicioDoDia } from '../services/metas.service';
import { getConfigBudget } from '../ai-platform/budget.service';

export interface StatusRateLimit {
  permitido: boolean;
  limite: number;
  usadoHoje: number;
}

export async function contarMensagensHoje(vendedorId: string, agora: Date = new Date()): Promise<number> {
  return prisma.simulationMessage.count({
    where: {
      role: 'VENDEDOR',
      sessao: { vendedorId },
      createdAt: { gte: inicioDoDia(agora) },
    },
  });
}

export async function verificarRateLimitDiario(vendedorId: string, empresaId: string, agora: Date = new Date()): Promise<StatusRateLimit> {
  const [{ dailyMessageLimitPerSeller }, usadoHoje] = await Promise.all([
    getConfigBudget(empresaId),
    contarMensagensHoje(vendedorId, agora),
  ]);

  return { permitido: usadoHoje < dailyMessageLimitPerSeller, limite: dailyMessageLimitPerSeller, usadoHoje };
}
