import { describe, expect, it } from 'vitest';
import { MARCADOR_SIMULAR_ERRO, MARCADOR_SIMULAR_TIMEOUT, MockAIProvider } from './mock-ai-provider';
import { AIProviderError } from './ai-provider.interface';
import { CoachContext } from '../../coach/context.types';
import { TrainerContext } from '../../treinador/context.types';

// Contexto COM bloco comercial autorizado (Etapa 2B.1) — o vendedor perguntou
// pelos próprios números.
const CONTEXTO_COACH: CoachContext = {
  seller: { displayName: 'Ana Vendedora' },
  store: { name: 'Loja Piloto' },
  pertinencia: { intencao: 'DUVIDA_COMERCIAL', estado: 'REFLETIR', dominios: ['HUMANO', 'DESENVOLVIMENTO', 'COMERCIAL'], origem: 'DETERMINISTICO' },
  humano: { checkinHoje: null, continuidade: [] },
  desenvolvimento: { competencyGaps: [], recentTrainings: [], intervencaoDoTurno: null, conhecimento: null, currentMission: null },
  comercial: {
    goal: { todayGoal: 1000, realized: 700, goalPercent: 70, amountRemaining: 300, estimatedSalesRemaining: 3 },
    performance: { ticket: 100, pa: 2, salesCount: 7 },
    baseline: { ticket: 90, pa: 1.8, status: 'disponivel' },
    gamification: { xp: 250, level: 'Bronze', streak: 2, recentBadges: [] },
    professionalMemorySummary: null,
    currentFocus: null,
    currentMission: null,
  },
  freshness: { lastDataSyncAt: new Date().toISOString() },
};

/** O MESMO vendedor, os MESMOS números — mas sem bloco comercial autorizado. */
const CONTEXTO_COACH_SEM_COMERCIAL: CoachContext = {
  ...CONTEXTO_COACH,
  pertinencia: { intencao: 'CONVERSA', estado: 'REFLETIR', dominios: ['HUMANO', 'DESENVOLVIMENTO'], origem: 'LLM' },
  humano: { checkinHoje: 'NEUTRAL', continuidade: [] },
  comercial: null,
};

/** O MESMO vendedor, os MESMOS números — mas em acolhimento. */
const CONTEXTO_COACH_ACOLHER: CoachContext = {
  ...CONTEXTO_COACH,
  pertinencia: { intencao: 'DESABAFO', estado: 'ACOLHER', dominios: ['HUMANO'], origem: 'DETERMINISTICO' },
  humano: { checkinHoje: 'NOT_GOOD', continuidade: [] },
  desenvolvimento: null,
  comercial: null,
};

const CONTEXTO_TREINADOR: TrainerContext = {
  seller: { displayName: 'Ana Vendedora' },
  store: { name: 'Loja Piloto' },
  performance: { ticket: 100, pa: 2, goalPercent: 70 },
  baseline: { ticket: 90, pa: 1.8 },
  development: { strengths: [], developmentAreas: [], currentFocus: null, recentTrainings: [], competencyGaps: [] },
  playbook: {
    version: 1,
    relevantSections: [{ category: 'OBJECOES', title: 'Objeção de preço', content: 'Reconheça, investigue, responda, reconecte ao valor, avance.', origin: 'DEMONSTRATIVO' }],
  },
  request: { mode: 'OBJECAO', objection: 'Está caro', situation: null },
  freshness: { lastDataSyncAt: null },
};

describe('MockAIProvider — especialista Coach (padrão)', () => {
  it('é determinístico: mesma entrada produz o mesmo texto', async () => {
    const provider = new MockAIProvider();
    const input = {
      systemPrompt: 'sp',
      messages: [{ role: 'user' as const, content: 'como estou hoje?' }],
      metadata: { specialist: 'coach' as const, context: CONTEXTO_COACH },
    };

    const r1 = await provider.generateResponse(input);
    const r2 = await provider.generateResponse(input);

    expect(r1.content).toBe(r2.content);
    expect(r1.provider).toBe('mock');
    expect(r1.inputTokens).toBeGreaterThan(0);
    expect(r1.outputTokens).toBeGreaterThan(0);
  });

  it('usa o CoachContext recebido — nunca inventa números fora do contexto', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'qual minha meta?' }],
      metadata: { specialist: 'coach', context: CONTEXTO_COACH },
    });

    expect(res.content).toContain('300.00'); // amountRemaining do contexto, não um número inventado
    expect(res.content).toContain('3'); // estimatedSalesRemaining do contexto
  });

  it('sem metadata.specialist, usa o caminho Coach por padrão (compatibilidade)', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'qual minha meta?' }],
      metadata: { context: CONTEXTO_COACH },
    });
    expect(res.content).toContain('300.00');
  });

  // Sem isto, o mock continuaria sendo um segundo motor comercial independente
  // do formatter — e dev, CI e todos os E2E veriam um produto que ainda cobra,
  // com a suíte verde.
  it('REGRESSÃO: sem bloco comercial autorizado, o mock NÃO cita número nenhum', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'qual minha meta?' }],
      metadata: { specialist: 'coach', context: CONTEXTO_COACH_ACOLHER },
    });

    expect(res.content).not.toContain('300.00');
    expect(res.content).not.toContain('1000');
    expect(res.content).not.toMatch(/pra bater sua meta/);
  });

  // O caso acima sai no early-return de ACOLHER e NÃO exercita o ramo
  // `if (!comercial)` — que é o caminho real de CONVERSA e CELEBRACAO.
  it('REGRESSÃO: em REFLETIR sem bloco comercial, perguntar por meta não produz número', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'qual minha meta?' }],
      metadata: { specialist: 'coach', context: CONTEXTO_COACH_SEM_COMERCIAL },
    });

    expect(res.content).not.toContain('300.00');
    expect(res.content).not.toMatch(/R\$/);
    // E oferece o caminho, em vez de simplesmente ignorar o que foi perguntado.
    expect(res.content).toMatch(/é só pedir/i);
  });

  it('em ACOLHER o mock acolhe, mesmo com os números disponíveis no banco', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'hoje estou mal' }],
      metadata: { specialist: 'coach', context: CONTEXTO_COACH_ACOLHER },
    });

    expect(res.content).toMatch(/quer me contar|prefere/i);
    expect(res.content).not.toMatch(/R\$/);
  });

  it('classificador de intenção devolve JSON com enum fechado', async () => {
    const provider = new MockAIProvider();
    // Mensagem AMBÍGUA de propósito: o curto-circuito determinístico não a
    // resolve, então este é o caminho que o classificador de fato percorre.
    const res = await provider.generateResponse({
      systemPrompt: 'classifique',
      messages: [{ role: 'user', content: 'preciso dar um jeito nisso aqui' }],
      metadata: { specialist: 'intent_classifier' },
    });

    const { intencao } = JSON.parse(res.content);
    expect(['DESABAFO', 'CONVERSA', 'DUVIDA_COMERCIAL', 'DESENVOLVIMENTO', 'CELEBRACAO', 'OUTRO']).toContain(intencao);
  });

  it('responde de forma segura mesmo sem contexto (nunca quebra)', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({ systemPrompt: 'sp', messages: [{ role: 'user', content: 'oi' }] });
    expect(res.content.length).toBeGreaterThan(0);
  });

  it('simula timeout quando a mensagem contém o marcador de teste', async () => {
    const provider = new MockAIProvider();
    await expect(
      provider.generateResponse({ systemPrompt: 'sp', messages: [{ role: 'user', content: MARCADOR_SIMULAR_TIMEOUT }] })
    ).rejects.toMatchObject({ type: 'timeout' } satisfies Partial<AIProviderError>);
  });

  it('simula erro de API quando a mensagem contém o marcador de teste', async () => {
    const provider = new MockAIProvider();
    await expect(
      provider.generateResponse({ systemPrompt: 'sp', messages: [{ role: 'user', content: MARCADOR_SIMULAR_ERRO }] })
    ).rejects.toMatchObject({ type: 'api_error' } satisfies Partial<AIProviderError>);
  });
});

describe('MockAIProvider — especialista Treinador', () => {
  it('usa o TrainerContext (modo, objeção, seção do playbook) — nunca inventa fora do contexto', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'Está caro' }],
      metadata: { specialist: 'trainer', context: CONTEXTO_TREINADOR },
    });

    expect(res.content).toContain('Está caro'); // objeção real do contexto
    expect(res.content).toContain('Objeção de preço'); // título real da seção do playbook usada
    expect(res.content).toMatch(/não é política oficial/); // seção é DEMONSTRATIVO — não pode virar "regra oficial"
  });

  it('cita a seção como oficial quando origin=OFICIAL, sem o aviso de demonstrativo', async () => {
    const provider = new MockAIProvider();
    const contextoOficial: TrainerContext = {
      ...CONTEXTO_TREINADOR,
      playbook: {
        version: 1,
        relevantSections: [{ category: 'ABORDAGEM', title: 'Mandamento #1', content: 'Receberei a cliente com positividade.', origin: 'OFICIAL' }],
      },
      request: { mode: 'ABORDAGEM', objection: null, situation: null },
    };
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'como abordar melhor?' }],
      metadata: { specialist: 'trainer', context: contextoOficial },
    });

    expect(res.content).toContain('Mandamento #1');
    expect(res.content).toContain('playbook da loja');
    expect(res.content).not.toMatch(/não é política oficial/);
  });

  it('responde de forma segura mesmo sem contexto (nunca quebra)', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse({
      systemPrompt: 'sp',
      messages: [{ role: 'user', content: 'oi' }],
      metadata: { specialist: 'trainer' },
    });
    expect(res.content.length).toBeGreaterThan(0);
  });
});
