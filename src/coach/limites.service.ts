// Rate limit diário por vendedor + budget mensal por empresa (seções 21/22 da
// fonte de verdade). Backend é a autoridade — nunca só frontend. Ambos lidos
// via ledger/contagem real (AIUsage/CoachMessage), nunca contador mutável.
import { prisma } from '../db';
import { inicioDoDia, inicioDoMes } from '../services/metas.service';
import { env } from '../config';

export interface StatusRateLimit {
  permitido: boolean;
  limite: number;
  usadoHoje: number;
}

export interface StatusBudget {
  permitido: boolean;
  limiteMensalUSD: number;
  gastoMensalUSD: number;
  percentualUsado: number;
}

async function getConfigBudget(empresaId: string) {
  const config = await prisma.aIBudgetConfig.findUnique({ where: { empresaId } });
  return {
    monthlyLimitUSD: config ? Number(config.monthlyLimitUSD) : env.AI_MONTHLY_BUDGET_USD_DEFAULT,
    dailyMessageLimitPerSeller: config?.dailyMessageLimitPerSeller ?? env.AI_DAILY_MESSAGE_LIMIT_DEFAULT,
  };
}

export async function contarMensagensHoje(vendedorId: string, agora: Date = new Date()): Promise<number> {
  return prisma.coachMessage.count({
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

export async function calcularGastoMensalUSD(empresaId: string, agora: Date = new Date()): Promise<number> {
  const resultado = await prisma.aIUsage.aggregate({
    where: { empresaId, createdAt: { gte: inicioDoMes(agora) } },
    _sum: { estimatedCostUSD: true },
  });
  return Number(resultado._sum.estimatedCostUSD ?? 0);
}

export async function verificarBudgetMensal(empresaId: string, agora: Date = new Date()): Promise<StatusBudget> {
  const [{ monthlyLimitUSD }, gastoMensalUSD] = await Promise.all([
    getConfigBudget(empresaId),
    calcularGastoMensalUSD(empresaId, agora),
  ]);

  return {
    permitido: gastoMensalUSD < monthlyLimitUSD,
    limiteMensalUSD: monthlyLimitUSD,
    gastoMensalUSD,
    percentualUsado: monthlyLimitUSD > 0 ? (gastoMensalUSD / monthlyLimitUSD) * 100 : 0,
  };
}
