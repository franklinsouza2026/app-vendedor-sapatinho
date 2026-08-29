// Rate limit diário por vendedor do Treinador (seção 25 da Fatia 5) — conta
// TrainerMessage, independente da contagem de CoachMessage. Cada especialista
// tem sua própria cota diária (mesmo valor de configuração,
// dailyMessageLimitPerSeller); o budget mensal em dólares, esse sim, é
// somado entre os dois em `src/ai-platform/budget.service.ts`. Backend é a
// autoridade — nunca só frontend.
import { prisma } from '../db';
import { inicioDoDia } from '../services/metas.service';
import { getConfigBudget } from '../ai-platform/budget.service';

export interface StatusRateLimit {
  permitido: boolean;
  limite: number;
  usadoHoje: number;
}

export async function contarMensagensHoje(vendedorId: string, agora: Date = new Date()): Promise<number> {
  return prisma.trainerMessage.count({
    where: {
      role: 'USER',
      conversation: { vendedorId },
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
