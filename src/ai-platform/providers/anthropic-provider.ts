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

// Cache só do caminho legado (sem apiKey própria — usa env.ANTHROPIC_API_KEY,
// comportamento pré-Fatia-7.5B intacto). Quando o AIGateway resolve uma
// credencial por empresa (Fatia 7.5B), passa a apiKey no construtor e um
// cliente novo é criado por chamada — sem cache, já que a credencial pode
// mudar a qualquer momento sem redeploy (seção 31).
let clienteCachePadrao: Anthropic | null = null;

export class AnthropicProvider implements AIProvider {
  constructor(private apiKeyPropria?: string) {}

  private getCliente(): Anthropic {
    if (this.apiKeyPropria) return new Anthropic({ apiKey: this.apiKeyPropria });

    if (!clienteCachePadrao) {
      if (!env.ANTHROPIC_API_KEY) {
        throw new AIProviderError('auth', 'ANTHROPIC_API_KEY não configurada — AnthropicProvider não pode ser usado');
      }
      clienteCachePadrao = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return clienteCachePadrao;
  }

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const inicio = Date.now();
    const cliente = this.getCliente();

    try {
      const response = await cliente.messages.create(
        {
          model: input.model ?? env.AI_MODEL,
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
