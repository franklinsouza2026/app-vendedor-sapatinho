// Provider Gemini (Fatia 7.5B) — usa o SDK oficial `@google/genai`. NÃO
// validado contra API real nesta sessão (sem credencial disponível no
// ambiente) — parâmetros conferidos contra a tipagem do pacote instalado
// (v2.19.0).
import { GoogleGenAI, ApiError as GeminiApiError } from '@google/genai';
import { env } from '../../config';
import { AIProvider, AIProviderError, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';

const MODELO_PADRAO = 'gemini-3-flash';

export class GeminiProvider implements AIProvider {
  constructor(private apiKey: string) {}

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const inicio = Date.now();
    const cliente = new GoogleGenAI({ apiKey: this.apiKey });
    const model = input.model ?? MODELO_PADRAO;

    try {
      const response = await cliente.models.generateContent({
        model,
        contents: input.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: {
          systemInstruction: input.systemPrompt,
          maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        },
      });

      return {
        content: response.text ?? '',
        provider: 'gemini',
        model,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - inicio,
        finishReason: response.candidates?.[0]?.finishReason,
      };
    } catch (err) {
      throw normalizarErro(err);
    }
  }
}

function normalizarErro(err: unknown): AIProviderError {
  if (err instanceof GeminiApiError) {
    if (err.status === 401 || err.status === 403) return new AIProviderError('auth', err.message);
    if (err.status === 429) return new AIProviderError('rate_limited', err.message);
    return new AIProviderError('api_error', err.message);
  }
  // ConnectionError/RequestTimeoutError do SDK não são exportadas publicamente
  // pra fazer `instanceof` — melhor esforço via nome/mensagem do erro.
  const nome = err instanceof Error ? err.name : '';
  if (nome.includes('Timeout')) return new AIProviderError('timeout', (err as Error).message);
  if (nome.includes('Connection')) return new AIProviderError('connection', (err as Error).message);
  return new AIProviderError('unknown', err instanceof Error ? err.message : 'erro desconhecido no provider Gemini');
}
