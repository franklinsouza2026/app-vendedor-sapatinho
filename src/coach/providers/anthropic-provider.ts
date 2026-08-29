// Provider real — implementado mesmo sem ANTHROPIC_API_KEY (a ausência da
// chave não bloqueia a arquitetura/testes desta fatia; só impede este
// provider de responder de verdade se AI_PROVIDER=anthropic for selecionado
// sem chave, o que falha com AIProviderError('auth', ...) no primeiro uso).
//
// NÃO VALIDADO CONTRA API REAL nesta sessão (sem credencial disponível no
// ambiente). Parâmetros conferidos contra @anthropic-ai/sdk v0.122.0 e a
// documentação atual do modelo (skill claude-api) — não inventados.
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config';
import { AIProvider, AIProviderError, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';

let clienteCache: Anthropic | null = null;
function getCliente(): Anthropic {
  if (!clienteCache) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new AIProviderError('auth', 'ANTHROPIC_API_KEY não configurada — AnthropicProvider não pode ser usado');
    }
    clienteCache = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return clienteCache;
}

export class AnthropicProvider implements AIProvider {
  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const inicio = Date.now();
    const cliente = getCliente();

    try {
      const response = await cliente.messages.create(
        {
          model: env.AI_MODEL,
          max_tokens: env.AI_MAX_OUTPUT_TOKENS,
          system: input.systemPrompt,
          messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
          // effort "low": respostas do Coach são curtas e conversacionais —
          // não precisam de raciocínio profundo, e isso mantém custo/latência baixos.
          output_config: { effort: 'low' },
        },
        { timeout: env.AI_TIMEOUT_MS }
      );

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');

      return {
        content: textBlock?.text ?? '',
        provider: 'anthropic',
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - inicio,
        finishReason: response.stop_reason ?? undefined,
        providerRequestId: response.id,
      };
    } catch (err) {
      throw normalizarErro(err);
    }
  }
}

function normalizarErro(err: unknown): AIProviderError {
  if (err instanceof Anthropic.AuthenticationError) return new AIProviderError('auth', err.message);
  if (err instanceof Anthropic.RateLimitError) return new AIProviderError('rate_limited', err.message);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AIProviderError('timeout', err.message);
  if (err instanceof Anthropic.APIConnectionError) return new AIProviderError('connection', err.message);
  if (err instanceof Anthropic.APIError) return new AIProviderError('api_error', err.message);
  return new AIProviderError('unknown', err instanceof Error ? err.message : 'erro desconhecido no provider de IA');
}
