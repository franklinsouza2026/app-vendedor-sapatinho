// Interface desacoplada de provider de IA (seção 2 da fonte de verdade). O
// domínio Coach nunca importa o SDK Anthropic diretamente — só isso.
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateResponseInput {
  systemPrompt: string;
  messages: AIMessage[];
  // contexto/metadata são passados como objetos livres pra não acoplar a
  // interface a CoachContext especificamente — quem monta o texto final da
  // mensagem já embutiu o contexto relevante antes de chamar o provider.
  metadata?: Record<string, unknown>;
}

export interface GenerateResponseResult {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  finishReason?: string;
  providerRequestId?: string;
}

export type AIProviderErrorType = 'timeout' | 'rate_limited' | 'auth' | 'connection' | 'api_error' | 'unknown';

export class AIProviderError extends Error {
  constructor(
    public type: AIProviderErrorType,
    message: string
  ) {
    super(message);
  }
}

export interface AIProvider {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}
