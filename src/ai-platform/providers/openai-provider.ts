// Provider OpenAI (Fatia 7.5B) — usa a Responses API oficial do SDK
// `openai` (não a Chat Completions legada). NÃO validado contra API real
// nesta sessão (sem credencial disponível no ambiente) — parâmetros
// conferidos contra a tipagem do pacote `openai` instalado (v6.49.0).
import OpenAI from 'openai';
import { env } from '../../config';
import { AIProvider, AIProviderError, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';

const MODELO_PADRAO = 'gpt-5.1-mini';

export class OpenAIProvider implements AIProvider {
  constructor(private apiKey: string) {}

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const inicio = Date.now();
    const cliente = new OpenAI({ apiKey: this.apiKey, timeout: env.AI_TIMEOUT_MS });
    const model = input.model ?? MODELO_PADRAO;

    try {
      const response = await cliente.responses.create({
        model,
        instructions: input.systemPrompt,
        input: input.messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: env.AI_MAX_OUTPUT_TOKENS,
      });

      return {
        content: response.output_text ?? '',
        provider: 'openai',
        model: response.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        latencyMs: Date.now() - inicio,
        finishReason: response.status,
        providerRequestId: response.id,
      };
    } catch (err) {
      throw normalizarErro(err);
    }
  }
}

function normalizarErro(err: unknown): AIProviderError {
  if (err instanceof OpenAI.AuthenticationError) return new AIProviderError('auth', err.message);
  if (err instanceof OpenAI.RateLimitError) return new AIProviderError('rate_limited', err.message);
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AIProviderError('timeout', err.message);
  if (err instanceof OpenAI.APIConnectionError) return new AIProviderError('connection', err.message);
  if (err instanceof OpenAI.APIError) return new AIProviderError('api_error', err.message);
  return new AIProviderError('unknown', err instanceof Error ? err.message : 'erro desconhecido no provider OpenAI');
}
