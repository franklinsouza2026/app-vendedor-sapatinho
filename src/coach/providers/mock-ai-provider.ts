// Provider determinístico — sem rede, sem custo, usado por padrão em
// dev/test/CI (seção 2 da fonte de verdade). Usa o CoachContext (recebido via
// metadata.context) pra provar que a resposta é baseada em fato real, não
// inventado — mesmo padrão que o AnthropicProvider vai receber.
import { AIProvider, AIProviderError, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';
import { CoachContext } from '../context.types';

// Marcadores de teste — nunca acionados por texto de usuário real por
// coincidência (prefixo improvável), usados pelos testes de falha/timeout.
export const MARCADOR_SIMULAR_TIMEOUT = '__SIMULATE_TIMEOUT__';
export const MARCADOR_SIMULAR_ERRO = '__SIMULATE_ERROR__';
export const MARCADOR_SIMULAR_LENTO = '__SIMULATE_SLOW__'; // usado só pra testar o lock de geração concorrente

export class MockAIProvider implements AIProvider {
  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const inicio = Date.now();
    const ultimaMensagem = input.messages[input.messages.length - 1]?.content ?? '';

    if (ultimaMensagem.includes(MARCADOR_SIMULAR_TIMEOUT)) {
      throw new AIProviderError('timeout', 'timeout simulado (MockAIProvider)');
    }
    if (ultimaMensagem.includes(MARCADOR_SIMULAR_ERRO)) {
      throw new AIProviderError('api_error', 'erro simulado (MockAIProvider)');
    }
    if (ultimaMensagem.includes(MARCADOR_SIMULAR_LENTO)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const contexto = input.metadata?.context as CoachContext | undefined;
    const content = gerarRespostaDeterministica(ultimaMensagem, contexto);

    return {
      content,
      provider: 'mock',
      model: 'mock-v1',
      inputTokens: estimarTokens(input.systemPrompt) + input.messages.reduce((acc, m) => acc + estimarTokens(m.content), 0),
      outputTokens: estimarTokens(content),
      latencyMs: Date.now() - inicio,
      finishReason: 'end_turn',
    };
  }
}

function estimarTokens(texto: string): number {
  return Math.max(1, Math.ceil(texto.length / 4)); // aproximação grosseira, só pra o mock ter números plausíveis
}

function gerarRespostaDeterministica(mensagemUsuario: string, contexto?: CoachContext): string {
  const nome = contexto?.seller.displayName?.split(' ')[0] ?? 'vendedor';

  if (!contexto) {
    return `Oi ${nome}! Ainda não tenho seus dados de hoje carregados, mas estou aqui. Como posso ajudar?`;
  }

  const texto = mensagemUsuario.toLowerCase();

  if (texto.includes('como estou') || texto.includes('meta')) {
    if (contexto.goal.todayGoal === null) {
      return `Ainda não vi uma meta de hoje cadastrada pra você, ${nome}. Assim que houver, já te aviso como está o progresso.`;
    }
    if (contexto.goal.amountRemaining !== null && contexto.goal.amountRemaining > 0) {
      const vendas =
        contexto.goal.estimatedSalesRemaining !== null
          ? ` Com seu ticket atual, isso é aproximadamente ${contexto.goal.estimatedSalesRemaining} ${contexto.goal.estimatedSalesRemaining === 1 ? 'venda' : 'vendas'}.`
          : '';
      return `Faltam R$ ${contexto.goal.amountRemaining.toFixed(2)} pra bater sua meta de hoje.${vendas} Vamos focar na próxima oportunidade?`;
    }
    return `Você já bateu a meta de hoje! Parabéns, ${nome}.`;
  }

  if (texto.includes('pa') || texto.includes('ticket')) {
    if (contexto.baseline.status === 'em_formacao') {
      return 'Ainda estou juntando dados suficientes pra comparar seu PA/ticket com sua média — em alguns dias já consigo te dar uma orientação mais precisa.';
    }
    return `Hoje seu PA está em ${contexto.performance.pa.toFixed(2)} e o ticket em R$ ${contexto.performance.ticket.toFixed(2)}. Vamos trabalhar uma oferta complementar natural na próxima venda?`;
  }

  if (texto.includes('foco') || texto.includes('organizar')) {
    return `Vamos organizar seu foco, ${nome}. Prioridade agora: ${contexto.development.currentFocus ?? 'bater a meta do dia com atendimentos de qualidade'}.`;
  }

  return `Entendi. Como posso te ajudar a evoluir sua venda hoje, ${nome}?`;
}
