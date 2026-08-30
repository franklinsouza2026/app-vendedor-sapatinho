// Provider determinístico — sem rede, sem custo, usado por padrão em
// dev/test/CI (seção 2 da fonte de verdade). Compartilhado entre todos os
// especialistas da AI Platform (Coach, Treinador, futuros). Cada especialista
// passa `metadata.specialist` + `metadata.context` na chamada — o mock usa
// isso pra gerar uma resposta grounded no contexto real de cada um, sem que
// este arquivo precise importar os tipos concretos de `coach`/`treinador`
// (evita dependência circular: coach/treinador importam da ai-platform, não
// o contrário) — daí a tipagem estrutural mínima abaixo, em vez de importar
// CoachContext/TrainerContext.
import { AIProvider, AIProviderError, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';

// Marcadores de teste — nunca acionados por texto de usuário real por
// coincidência (prefixo improvável), usados pelos testes de falha/timeout.
export const MARCADOR_SIMULAR_TIMEOUT = '__SIMULATE_TIMEOUT__';
export const MARCADOR_SIMULAR_ERRO = '__SIMULATE_ERROR__';
export const MARCADOR_SIMULAR_LENTO = '__SIMULATE_SLOW__'; // usado só pra testar o lock de geração concorrente

interface ContextoCoachMinimo {
  seller: { displayName: string };
  goal: { todayGoal: number | null; amountRemaining: number | null; estimatedSalesRemaining: number | null };
  performance: { pa: number; ticket: number };
  baseline: { status: 'disponivel' | 'em_formacao' };
  development: { currentFocus: string | null };
}

interface ContextoTreinadorMinimo {
  seller: { displayName: string };
  performance: { ticket: number; pa: number; goalPercent: number | null };
  baseline: { ticket: number | null; pa: number | null };
  playbook: { version: number | null; relevantSections: { category: string; title: string; content: string; origin: 'OFICIAL' | 'DEMONSTRATIVO' }[] };
  request: { mode: string; objection: string | null; situation: string | null };
}

interface PersonaSimuladorMinima {
  profile: string;
  initialNeed: string;
  hiddenNeeds: string[];
  objections: string[];
  behavior: string;
}

interface ContextoSimuladorClienteMinimo {
  scenario: { title: string; objective: string };
  persona: PersonaSimuladorMinima;
  turnCount: number;
}

interface ContextoSimuladorAvaliacaoMinimo {
  scenario: { title: string; objective: string };
  criteria: string[];
  transcript: { role: string; content: string }[];
}

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

    const especialista = input.metadata?.specialist as 'coach' | 'trainer' | 'simulator' | undefined;
    const modo = input.metadata?.mode as 'client' | 'evaluator' | undefined;
    let content: string;
    if (especialista === 'simulator' && modo === 'evaluator') {
      content = gerarAvaliacaoSimulador(input.metadata?.context as ContextoSimuladorAvaliacaoMinimo | undefined);
    } else if (especialista === 'simulator') {
      content = gerarFalaClienteSimulador(input.metadata?.context as ContextoSimuladorClienteMinimo | undefined);
    } else if (especialista === 'trainer') {
      content = gerarRespostaTreinador(ultimaMensagem, input.metadata?.context as ContextoTreinadorMinimo | undefined);
    } else {
      content = gerarRespostaCoach(ultimaMensagem, input.metadata?.context as ContextoCoachMinimo | undefined);
    }

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

function gerarRespostaCoach(mensagemUsuario: string, contexto?: ContextoCoachMinimo): string {
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

function gerarRespostaTreinador(mensagemUsuario: string, contexto?: ContextoTreinadorMinimo): string {
  const nome = contexto?.seller.displayName?.split(' ')[0] ?? 'vendedor';

  if (!contexto) {
    return `Oi ${nome}! Ainda não tenho seu contexto carregado, mas posso te ajudar com técnica de venda. Qual é a situação?`;
  }

  const secoesOficiais = contexto.playbook.relevantSections.filter((s) => s.origin === 'OFICIAL');
  const secoesDemonstrativas = contexto.playbook.relevantSections.filter((s) => s.origin === 'DEMONSTRATIVO');

  // Prova de grounding pro E2E/testes: cita o título real da seção do
  // playbook usada (nunca inventa o conteúdo — usa o que veio no contexto).
  const referenciaPlaybook =
    secoesOficiais.length > 0
      ? ` Segundo o playbook da loja ("${secoesOficiais[0].title}"): ${resumirConteudo(secoesOficiais[0].content)}`
      : secoesDemonstrativas.length > 0
        ? ` Não encontrei uma regra oficial da loja pra isso ainda — aqui vai uma boa prática geral de vendas, não é política oficial ("${secoesDemonstrativas[0].title}"): ${resumirConteudo(secoesDemonstrativas[0].content)}`
        : '';

  if (contexto.request.mode === 'OBJECAO') {
    const objecao = contexto.request.objection ?? mensagemUsuario;
    return (
      `LEITURA: a cliente disse "${objecao}" — normalmente isso é uma sinalização de dúvida, não uma recusa definitiva.\n` +
      `RESPOSTA SUGERIDA: reconheça o que ela disse, investigue o motivo antes de argumentar, e reconecte com o que ela veio buscar.\n` +
      `PRÓXIMO PASSO: depois de entender o motivo, apresente uma solução concreta e avance pro fechamento.${referenciaPlaybook}`
    );
  }

  if (contexto.request.mode === 'PA' || mensagemUsuario.toLowerCase().includes('pa')) {
    return `Seu PA hoje está em ${contexto.performance.pa.toFixed(2)}. Pra aumentar, ofereça um produto complementar coerente com o que a cliente já escolheu, sempre depois de entender a necessidade dela.${referenciaPlaybook}`;
  }

  if (contexto.request.mode === 'TICKET' || mensagemUsuario.toLowerCase().includes('ticket')) {
    return `Seu ticket médio hoje está em R$ ${contexto.performance.ticket.toFixed(2)}. Demonstrar valor antes de falar preço ajuda a cliente a enxergar por que vale o investimento.${referenciaPlaybook}`;
  }

  return `Entendi a situação, ${nome}. Vamos praticar isso juntos?${referenciaPlaybook}`;
}

function resumirConteudo(conteudo: string): string {
  return conteudo.length > 140 ? `${conteudo.slice(0, 140)}...` : conteudo;
}

// Fala do cliente simulado — determinística a partir da persona estruturada
// (nunca inventada pelo mock): turno 0 é a abertura (initialNeed/behavior),
// turnos seguintes percorrem as objeções cadastradas e, no final, uma
// necessidade oculta — igual ao roteiro que o prompt real pede ao LLM pra
// seguir (seção "personas determinísticas" da Fatia 6).
function gerarFalaClienteSimulador(contexto?: ContextoSimuladorClienteMinimo): string {
  if (!contexto) return 'Oi, será que vocês têm o que eu preciso?';

  const { persona, turnCount } = contexto;
  if (turnCount <= 0) return persona.initialNeed || persona.behavior || 'Oi, só estou dando uma olhada.';

  const idxObjecao = turnCount - 1;
  if (idxObjecao < persona.objections.length) return persona.objections[idxObjecao];

  if (persona.hiddenNeeds.length > 0) return `Na verdade, o que eu realmente preciso é ${persona.hiddenNeeds[0]}.`;

  return 'Entendi, faz sentido o que você está dizendo.';
}

// Avaliação determinística — nunca "dê uma nota final" livre: cada critério
// relevante recebe um score derivado do tamanho real do transcript (prova
// de grounding testável), nunca um número fixo arbitrário. O backend ainda
// recalcula scoreFinal a partir destes critérios — o provider nunca decide
// a nota final sozinho (seção "nota" da Fatia 6).
function gerarAvaliacaoSimulador(contexto?: ContextoSimuladorAvaliacaoMinimo): string {
  if (!contexto) {
    return JSON.stringify({
      scores: {},
      strengths: [],
      improvements: ['Sessão sem transcript suficiente para avaliar.'],
      missedOpportunities: [],
      betterExample: '',
      summary: 'Não foi possível avaliar esta sessão.',
    });
  }

  const turnosVendedor = contexto.transcript.filter((m) => m.role === 'VENDEDOR').length;
  // Base 60 + até +30 conforme número de turnos (prática mais longa),
  // limitado a 90 — nunca 100 automático, deixa espaço pro julgamento real.
  const baseScore = Math.min(90, 60 + turnosVendedor * 6);

  const scores: Record<string, number> = {};
  for (const criterio of contexto.criteria) {
    scores[criterio] = baseScore;
  }

  return JSON.stringify({
    scores,
    strengths: turnosVendedor >= 2 ? ['Manteve a conversa fluindo com a cliente'] : [],
    improvements: ['Investigar mais a necessidade antes de argumentar'],
    missedOpportunities: turnosVendedor < 3 ? ['Poderia ter oferecido um produto complementar'] : [],
    betterExample: 'Entendi — me conta um pouco mais sobre o que você está buscando, assim consigo te ajudar melhor.',
    summary: `Simulação "${contexto.scenario.title}" concluída com ${turnosVendedor} interações do vendedor.`,
  });
}
