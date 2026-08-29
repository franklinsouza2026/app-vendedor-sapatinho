import { describe, expect, it } from 'vitest';
import { MARCADOR_SIMULAR_ERRO, MARCADOR_SIMULAR_TIMEOUT, MockAIProvider } from './mock-ai-provider';
import { AIProviderError } from './ai-provider.interface';
import { CoachContext } from '../../coach/context.types';
import { TrainerContext } from '../../treinador/context.types';

const CONTEXTO_COACH: CoachContext = {
  seller: { displayName: 'Ana Vendedora' },
  store: { name: 'Loja Piloto' },
  goal: { todayGoal: 1000, realized: 700, goalPercent: 70, amountRemaining: 300, estimatedSalesRemaining: 3 },
  performance: { ticket: 100, pa: 2, salesCount: 7 },
  baseline: { ticket: 90, pa: 1.8, status: 'disponivel' },
  gamification: { xp: 250, level: 'Bronze', streak: 2, recentBadges: [] },
  development: { currentFocus: null, currentMission: null, recentTrainings: [], professionalMemorySummary: null },
  freshness: { lastDataSyncAt: new Date().toISOString() },
};

const CONTEXTO_TREINADOR: TrainerContext = {
  seller: { displayName: 'Ana Vendedora' },
  store: { name: 'Loja Piloto' },
  performance: { ticket: 100, pa: 2, goalPercent: 70 },
  baseline: { ticket: 90, pa: 1.8 },
  development: { strengths: [], developmentAreas: [], currentFocus: null, recentTrainings: [] },
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
