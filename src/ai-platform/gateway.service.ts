// AI Gateway (Fatia 7.5B) — ÚNICO ponto por onde um especialista (Coach/
// Treinador/Simulador/futuros agentes) fala com um provider de IA real.
// Especialistas nunca importam Anthropic/OpenAI/Gemini SDK, nunca decidem
// qual provider usar — só chamam `gerarViaGateway()` com o que já sabem
// (empresa, prompt, mensagens). Resolução de provider/modelo/credencial,
// estimativa de custo e telemetria de saúde do provider vivem só aqui —
// nunca duplicados em cada especialista (seção 4/13 da fonte de verdade).
import { EspecialistaIA, NomeProviderIA } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { createLogger } from '../utils/logger';
import { AIMessage, AIProvider, AIProviderError, GenerateResponseResult } from './providers/ai-provider.interface';
import { MockAIProvider } from './providers/mock-ai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { calcularCustoEstimadoUSD } from './custo';
import { decifrarSegredo } from './secrets';
import { MODELO_PADRAO } from './modelos-permitidos';

const log = createLogger('ai-platform:gateway');

export interface ConfiguracaoIAResolvida {
  provider: NomeProviderIA;
  model: string | null;
  enabled: boolean;
}

const NOME_PROVIDER_MINUSCULO: Record<NomeProviderIA, string> = {
  MOCK: 'mock',
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
};

/**
 * Configuração efetiva de IA da empresa — se o Admin nunca configurou nada
 * (nenhuma linha em CompanyAIConfiguration), o comportamento é IDÊNTICO ao
 * pré-Fatia-7.5B: `env.AI_PROVIDER` decide (nunca quebra dev/test/CI sem
 * nenhuma configuração administrativa).
 */
export async function getConfiguracaoIA(empresaId: string): Promise<ConfiguracaoIAResolvida> {
  const config = await prisma.companyAIConfiguration.findUnique({ where: { empresaId } });
  if (!config) {
    return { provider: env.AI_PROVIDER === 'anthropic' ? 'ANTHROPIC' : 'MOCK', model: null, enabled: true };
  }
  return { provider: config.activeProvider, model: config.activeModel, enabled: config.enabled };
}

/** Exportada pra uso do "Testar conexão" do Admin (seção 30) — precisa
 * instanciar um provider específico independente de ele já estar ativo. */
export async function instanciarProvider(empresaId: string, provider: NomeProviderIA): Promise<AIProvider> {
  if (provider === 'MOCK') return new MockAIProvider();

  const credencial = await prisma.aIProviderCredential.findUnique({ where: { empresaId_provider: { empresaId, provider } } });

  if (!credencial) {
    // Caminho legado: sem CompanyAIConfiguration em banco, ANTHROPIC resolvido
    // só por env.AI_PROVIDER — usa env.ANTHROPIC_API_KEY (comportamento
    // idêntico ao pré-Fatia-7.5B). Qualquer outro provider sem credencial é
    // erro de configuração real (Admin ativou sem configurar a chave).
    if (provider === 'ANTHROPIC') return new AnthropicProvider();
    throw new AIProviderError('configuration_error', `provider ${provider} está ativo mas não tem credencial configurada nesta empresa`);
  }

  const apiKey = decifrarSegredo(credencial);
  switch (provider) {
    case 'ANTHROPIC':
      return new AnthropicProvider(apiKey);
    case 'OPENAI':
      return new OpenAIProvider(apiKey);
    case 'GEMINI':
      return new GeminiProvider(apiKey);
    default:
      throw new AIProviderError('unknown', `provider desconhecido: ${provider}`);
  }
}

async function registrarSaude(empresaId: string, provider: NomeProviderIA, ok: boolean, latencyMs: number, errorType: string | null) {
  try {
    await prisma.aIProviderHealth.upsert({
      where: { empresaId_provider: { empresaId, provider } },
      create: { empresaId, provider, lastCallAt: new Date(), lastCallOk: ok, lastErrorType: errorType, lastLatencyMs: latencyMs },
      update: { lastCallAt: new Date(), lastCallOk: ok, lastErrorType: errorType, lastLatencyMs: latencyMs },
    });
  } catch (err) {
    log.error({ err, empresaId, provider }, 'falha ao registrar saúde do provider — não bloqueia a chamada real');
  }
}

export interface GerarViaGatewayParams {
  empresaId: string;
  systemPrompt: string;
  messages: AIMessage[];
  metadata?: Record<string, unknown>;
}

export interface GerarViaGatewayResultado {
  resultado: GenerateResponseResult;
  custoUSD: number;
}

/**
 * Chamada real de IA — resolve provider/modelo/credencial da empresa, chama
 * o provider, estima custo e registra saúde. Nunca escreve AIUsage (isso
 * continua no especialista, que sabe conversationId/messageId) — nunca
 * decide rate limit/budget (isso é regra de cada especialista, seção 13:
 * "não colocar regra de negócio de Coach/Trainer/Simulator dentro do Gateway").
 */
export async function gerarViaGateway(params: GerarViaGatewayParams): Promise<GerarViaGatewayResultado> {
  const config = await getConfiguracaoIA(params.empresaId);
  const inicio = Date.now();

  if (!config.enabled) {
    await registrarSaude(params.empresaId, config.provider, false, 0, 'configuration_error');
    throw new AIProviderError('configuration_error', 'IA está desabilitada para esta empresa (Admin > IA)');
  }

  try {
    const provider = await instanciarProvider(params.empresaId, config.provider);
    const resultado = await provider.generateResponse({
      systemPrompt: params.systemPrompt,
      messages: params.messages,
      metadata: params.metadata,
      model: config.model ?? undefined,
    });

    const custoUSD =
      resultado.provider === 'mock'
        ? 0
        : calcularCustoEstimadoUSD(resultado.provider, resultado.model, resultado.inputTokens, resultado.outputTokens);

    await registrarSaude(params.empresaId, config.provider, true, Date.now() - inicio, null);
    return { resultado, custoUSD };
  } catch (err) {
    const tipoErro = err instanceof AIProviderError ? err.type : 'unknown';
    await registrarSaude(params.empresaId, config.provider, false, Date.now() - inicio, tipoErro);
    throw err;
  }
}

/**
 * Provider/modelo que uma chamada de IA desta empresa usaria agora — usado
 * pelo path de erro de cada especialista (a AIUsage de uma falha precisa
 * refletir o provider REAL configurado, não sempre `env.AI_PROVIDER`).
 */
export async function providerEModeloParaTelemetria(empresaId: string): Promise<{ provider: string; model: string }> {
  const config = await getConfiguracaoIA(empresaId);
  const nomeMinusculo = NOME_PROVIDER_MINUSCULO[config.provider];
  const model = config.model ?? (config.provider === 'ANTHROPIC' ? env.AI_MODEL : config.provider === 'MOCK' ? 'mock-v1' : defaultModelo(config.provider));
  return { provider: nomeMinusculo, model };
}

function defaultModelo(provider: NomeProviderIA): string {
  if (provider === 'MOCK') return 'mock-v1';
  return MODELO_PADRAO[provider];
}
