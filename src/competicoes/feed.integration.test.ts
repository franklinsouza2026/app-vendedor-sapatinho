// FeedEvent (Fatia 8, seção 33-42/78/83/96/101/105/107) — idempotente
// (anti-spam), visibilidade por loja, template determinístico (nunca HTML).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { publicarEventoFeed, listarFeed } from './feed.service';

describe('FeedEvent — idempotência (seção 40/83/101)', () => {
  it('mesmo (eventType, sourceType, sourceId) 2x nunca duplica', async () => {
    const sourceId = randomUUID();
    await publicarEventoFeed({ eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: {} });
    await publicarEventoFeed({ eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: {} });

    const total = await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId } });
    expect(total).toBe(1);
  });

  it('2 publicações concorrentes do mesmo evento: só 1 é efetiva', async () => {
    const sourceId = randomUUID();
    await Promise.all([
      publicarEventoFeed({ eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { badgeTitulo: 'X' } }),
      publicarEventoFeed({ eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { badgeTitulo: 'X' } }),
    ]);
    const total = await prisma.feedEvent.count({ where: { eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId } });
    expect(total).toBe(1);
  });
});

describe('FeedEvent — visibilidade (seção 36/105)', () => {
  it('evento STORE de outra loja nunca aparece pro viewer', async () => {
    const lojaViewer = randomUUID();
    const lojaOutra = randomUUID();
    const sourceId = randomUUID();
    await publicarEventoFeed({ eventType: 'RECOGNITION_RECEIVED', sourceType: 'TESTE', sourceId, visibility: 'STORE', lojaId: lojaOutra, templateData: { recognitionTipo: 'PERFORMANCE' } });

    const { eventos } = await listarFeed(lojaViewer, { limite: 50 });
    expect(eventos.some((e) => e.id && e.eventType === 'RECOGNITION_RECEIVED')).toBe(false);
  });

  it('evento COMPANY aparece pra qualquer loja', async () => {
    const sourceId = randomUUID();
    await publicarEventoFeed({ eventType: 'COMPETITION_WON', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { competitionName: 'Teste' } });

    const { eventos } = await listarFeed(randomUUID(), { limite: 50 });
    expect(eventos.some((e) => e.mensagem.includes('Teste'))).toBe(true);
  });
});
