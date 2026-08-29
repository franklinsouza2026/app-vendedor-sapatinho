// Budget mensal por empresa (seção 22 da fonte de verdade do Coach / seção 25
// da fonte de verdade do Treinador) — compartilhado por TODOS os especialistas
// da AI Platform (Coach, Treinador, futuros). "Empresa deve conseguir
// controlar custo total de IA": a soma em `calcularGastoMensalUSD` agrega
// `AIUsage` da empresa inteira, sem filtrar por especialista — de propósito.
// Backend é a autoridade — nunca só frontend. Lido via ledger real (AIUsage),
// nunca contador mutável.
import { prisma } from '../db';
import { inicioDoMes } from '../services/metas.service';
import { env } from '../config';

export interface StatusBudget {
  permitido: boolean;
  limiteMensalUSD: number;
  gastoMensalUSD: number;
  percentualUsado: number;
}

export async function getConfigBudget(empresaId: string) {
  const config = await prisma.aIBudgetConfig.findUnique({ where: { empresaId } });
  return {
    monthlyLimitUSD: config ? Number(config.monthlyLimitUSD) : env.AI_MONTHLY_BUDGET_USD_DEFAULT,
    dailyMessageLimitPerSeller: config?.dailyMessageLimitPerSeller ?? env.AI_DAILY_MESSAGE_LIMIT_DEFAULT,
  };
}

export async function calcularGastoMensalUSD(empresaId: string, agora: Date = new Date()): Promise<number> {
  const resultado = await prisma.aIUsage.aggregate({
    where: { empresaId, createdAt: { gte: inicioDoMes(agora) } },
    _sum: { estimatedCostUSD: true },
  });
  return Number(resultado._sum.estimatedCostUSD ?? 0);
}

export async function verificarBudgetMensal(empresaId: string, agora: Date = new Date()): Promise<StatusBudget> {
  const [{ monthlyLimitUSD }, gastoMensalUSD] = await Promise.all([getConfigBudget(empresaId), calcularGastoMensalUSD(empresaId, agora)]);

  return {
    permitido: gastoMensalUSD < monthlyLimitUSD,
    limiteMensalUSD: monthlyLimitUSD,
    gastoMensalUSD,
    percentualUsado: monthlyLimitUSD > 0 ? (gastoMensalUSD / monthlyLimitUSD) * 100 : 0,
  };
}
