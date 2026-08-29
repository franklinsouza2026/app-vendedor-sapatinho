import { describe, expect, it } from 'vitest';
import { MARCADOR_SIMULAR_ERRO, MARCADOR_SIMULAR_TIMEOUT, MockAIProvider } from './mock-ai-provider';
import { AIProviderError } from './ai-provider.interface';
import { CoachContext } from '../context.types';

const CONTEXTO_BASE: CoachContext = {
  seller: { displayName: 'Ana Vendedora' },
  store: { name: 'Loja Piloto' },
  goal: { todayGoal: 1000, realized: 700, goalPercent: 70, amountRemaining: 300, estimatedSalesRemaining: 3 },
  performance: { ticket: 100, pa: 2, salesCount: 7 },
  baseline: { ticket: 90, pa: 1.8, status: 'disponivel' },
  gamification: { xp: 250, level: 'Bronze', streak: 2, recentBadges: [] },
  development: { currentFocus: null, currentMission: null, recentTrainings: [], professionalMemorySummary: null },
  freshness: { lastDataSyncAt: new Date().toISOString() },
};

describe('MockAIProvider', () => {
  it('é determinístico: mesma entrada produz o mesmo texto', async () => {
    const provider = new MockAIProvider();
    const input = { systemPrompt: 'sp', messages: [{ role: 'user' as const, content: 'como estou hoje?' }], metadata: { context: CONTEXTO_BASE } };

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
      metadata: { context: CONTEXTO_BASE },
    });

    expect(res.content).toContain('300.00'); // amountRemaining do contexto, não um número inventado
    expect(res.content).toContain('3'); // estimatedSalesRemaining do contexto
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
