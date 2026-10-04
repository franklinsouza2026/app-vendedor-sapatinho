// FeedEvent (Fatia 8, seção 33-42/78/83/96/101/105/107) — idempotente
// (anti-spam), visibilidade por loja, template determinístico (nunca HTML).
// Fase 1 (D8): todo evento tem empresa; leitura nunca atravessa empresas.
// Fase 1 (D4): evento revogado some da leitura, nunca é apagado.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { publicarEventoFeed, listarFeed, revogarEventoFeed } from './feed.service';

describe('FeedEvent — idempotência (seção 40/83/101)', () => {
  it('mesmo (eventType, sourceType, sourceId) 2x nunca duplica', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const sourceId = randomUUID();
    await publicarEventoFeed({ empresaId: empresa.id, eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: {} });
    await publicarEventoFeed({ empresaId: empresa.id, eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: {} });

    const total = await prisma.feedEvent.count({ where: { eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId } });
    expect(total).toBe(1);
  });

  it('2 publicações concorrentes do mesmo evento: só 1 é efetiva', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const sourceId = randomUUID();
    await Promise.all([
      publicarEventoFeed({ empresaId: empresa.id, eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { badgeTitulo: 'X' } }),
      publicarEventoFeed({ empresaId: empresa.id, eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { badgeTitulo: 'X' } }),
    ]);
    const total = await prisma.feedEvent.count({ where: { eventType: 'BADGE_EARNED', sourceType: 'TESTE', sourceId } });
    expect(total).toBe(1);
  });

  it('sem empresa resolvível o evento é recusado (nunca adivinha o tenant)', async () => {
    await expect(publicarEventoFeed({ eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId: randomUUID(), visibility: 'COMPANY', templateData: {} })).rejects.toThrow();
  });
});

describe('FeedEvent — visibilidade (seção 36/105) e empresa (D8)', () => {
  it('evento STORE de outra loja nunca aparece pro viewer', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra', codigoErp: `L-${randomUUID()}` } });
    const sourceId = randomUUID();
    await publicarEventoFeed({ eventType: 'RECOGNITION_RECEIVED', sourceType: 'TESTE', sourceId, visibility: 'STORE', lojaId: outraLoja.id, templateData: { recognitionTipo: 'PERFORMANCE' } });

    const { eventos } = await listarFeed(empresa.id, loja.id, { limite: 50 });
    expect(eventos.some((e) => e.eventType === 'RECOGNITION_RECEIVED')).toBe(false);
  });

  it('evento COMPANY aparece pra qualquer loja da MESMA empresa', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const sourceId = randomUUID();
    await publicarEventoFeed({ empresaId: empresa.id, eventType: 'COMPETITION_WON', sourceType: 'TESTE', sourceId, visibility: 'COMPANY', templateData: { competitionName: 'Teste' } });

    const { eventos } = await listarFeed(empresa.id, loja.id, { limite: 50 });
    expect(eventos.some((e) => e.mensagem.includes('Teste'))).toBe(true);
  });

  it('evento COMPANY da empresa A NUNCA aparece para a empresa B', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const marca = `Segredo-${randomUUID()}`;
    await publicarEventoFeed({ empresaId: a.empresa.id, eventType: 'COMPETITION_WON', sourceType: 'TESTE', sourceId: randomUUID(), visibility: 'COMPANY', templateData: { competitionName: marca } });

    const { eventos } = await listarFeed(b.empresa.id, b.loja.id, { limite: 50 });
    expect(eventos.some((e) => e.mensagem.includes(marca))).toBe(false);
  });

  it('evento revogado some da leitura, mas continua no banco; republicar reativa a MESMA linha', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const sourceId = randomUUID();
    await publicarEventoFeed({ eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'STORE', lojaId: loja.id, subjectId: vendedor.id, templateData: {} });
    expect(await revogarEventoFeed('GOAL_REACHED', 'TESTE', sourceId)).toBe(1);
    expect(await revogarEventoFeed('GOAL_REACHED', 'TESTE', sourceId)).toBe(0);

    let lista = await listarFeed(empresa.id, loja.id, { limite: 50 });
    expect(lista.eventos.some((e) => e.eventType === 'GOAL_REACHED')).toBe(false);
    expect(await prisma.feedEvent.count({ where: { sourceId } })).toBe(1);

    await publicarEventoFeed({ eventType: 'GOAL_REACHED', sourceType: 'TESTE', sourceId, visibility: 'STORE', lojaId: loja.id, subjectId: vendedor.id, templateData: {} });
    lista = await listarFeed(empresa.id, loja.id, { limite: 50 });
    expect(lista.eventos.some((e) => e.eventType === 'GOAL_REACHED')).toBe(true);
    expect(await prisma.feedEvent.count({ where: { sourceId } })).toBe(1);
  });
});
