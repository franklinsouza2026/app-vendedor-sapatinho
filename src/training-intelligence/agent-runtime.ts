// Plumbing compartilhado por todos os agentes lógicos da Training
// Intelligence Platform — evita repetir 9x o mesmo bloco de "checar
// budget → chamar Gateway → registrar AIUsage → tratar erro" que Coach/
// Treinador/Simulador já implementam cada um por si (aqui centralizado
// porque são muitos agentes na mesma fatia, não porque a duplicação
// anterior estivesse errada). SEMPRE passa pelo AI Gateway único — nenhum
// agente importa provider/SDK diretamente (seção 38).
import { EspecialistaIA } from '@prisma/client';
import { prisma } from '../db';
import { gerarViaGateway, providerEModeloParaTelemetria } from '../ai-platform/gateway.service';
import { verificarBudgetMensal } from '../ai-platform/budget.service';
import { AIProviderError } from '../ai-platform/providers';
import { createLogger } from '../utils/logger';
import { TrainingIntelligenceError, parsearOutputAgente } from './types';
import { z } from 'zod';

const log = createLogger('training-intelligence:agent-runtime');

export interface ChamarAgenteParams {
  empresaId: string;
  vendedorId: string;
  jobId: string;
  specialist: EspecialistaIA;
  specialistMockKey: string; // 'research_agent' | 'curator_agent' | ... (metadata.specialist do MockAIProvider)
  systemPrompt: string;
  userMessage: string;
  context: Record<string, unknown>;
}

/**
 * Chama um agente via AI Gateway, valida o JSON devolvido contra o schema
 * esperado e registra AIUsage (sucesso ou falha) — nunca deixa uma chamada
 * sem rastro de custo, mesmo quando o output é inválido (seção 43/61).
 */
export async function chamarAgente<T>(params: ChamarAgenteParams, schema: z.ZodType<T>): Promise<T> {
  const budget = await verificarBudgetMensal(params.empresaId);
  if (!budget.permitido) {
    throw new TrainingIntelligenceError('budget_exceeded', 'orçamento mensal de IA da empresa esgotado — job pausado com segurança');
  }

  let resultado, custoUSD;
  try {
    ({ resultado, custoUSD } = await gerarViaGateway({
      empresaId: params.empresaId,
      systemPrompt: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
      metadata: { specialist: params.specialistMockKey, context: params.context },
    }));
  } catch (err) {
    await registrarFalha(params, err);
    if (err instanceof AIProviderError && err.type === 'configuration_error') {
      throw new TrainingIntelligenceError('provider_unavailable', 'IA está desabilitada ou sem provider configurado para esta empresa');
    }
    throw new TrainingIntelligenceError('provider_unavailable', `${params.specialist} indisponível no momento`);
  }

  await prisma.aIUsage.create({
    data: {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      specialist: params.specialist,
      provider: resultado.provider,
      model: resultado.model,
      inputTokens: resultado.inputTokens,
      outputTokens: resultado.outputTokens,
      estimatedCostUSD: custoUSD,
      latencyMs: resultado.latencyMs,
      status: 'SUCESSO',
    },
  });

  try {
    return parsearOutputAgente(schema, resultado.content, params.specialist);
  } catch (err) {
    // Output chegou (custo já registrado como SUCESSO — a chamada em si
    // funcionou), mas o CONTEÚDO é inválido — nunca persistir como
    // aprovado (seção 61). O chamador decide se isso derruba o job inteiro
    // ou só essa etapa (falha parcial, seção 47).
    log.warn({ jobId: params.jobId, specialist: params.specialist, err }, 'agente devolveu output inválido — não será persistido como aprovado');
    throw err;
  }
}

async function registrarFalha(params: ChamarAgenteParams, err: unknown) {
  try {
    const status = err instanceof AIProviderError && err.type === 'timeout' ? 'TIMEOUT' : 'ERRO';
    const { provider, model } = await providerEModeloParaTelemetria(params.empresaId);
    await prisma.aIUsage.create({
      data: {
        empresaId: params.empresaId,
        vendedorId: params.vendedorId,
        specialist: params.specialist,
        provider,
        model,
        estimatedCostUSD: 0,
        status,
      },
    });
  } catch (usageErr) {
    log.error({ usageErr }, 'falha ao registrar AIUsage de erro — não bloqueia o tratamento do erro original');
  }
}
