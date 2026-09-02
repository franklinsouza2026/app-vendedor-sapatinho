// Competições — rotas do vendedor (Fatia 8, seção 52/85/99). Sempre
// req.auth, nunca id de outro vendedor; privacidade de faturamento
// preservada (score de GOAL_ATTAINMENT é sempre %, nunca valor bruto).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarSeason } from '../competicoes/seasons.service';

async function tokenVendedor() {
  const { empresa, loja, vendedor } = await criarFixtureEmpresa();
  return { token: assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' }), vendedor };
}

describe('GET /temporadas/atual, /competicoes, /ligas, /feed, /reconhecimentos — smoke real', () => {
  it('sem nenhuma season/competição ativa, todas as rotas respondem 200 com listas vazias (seção 94/115)', async () => {
    const { token } = await tokenVendedor();

    const temporada = await request(app).get('/temporadas/atual').set('Authorization', `Bearer ${token}`);
    expect(temporada.status).toBe(200);

    const feed = await request(app).get('/feed').set('Authorization', `Bearer ${token}`);
    expect(feed.status).toBe(200);
    expect(Array.isArray(feed.body.eventos)).toBe(true);

    const reconhecimentos = await request(app).get('/reconhecimentos').set('Authorization', `Bearer ${token}`);
    expect(reconhecimentos.status).toBe(200);
    expect(reconhecimentos.body.reconhecimentos).toEqual([]);

    const ligas = await request(app).get('/ligas').set('Authorization', `Bearer ${token}`);
    expect(ligas.status).toBe(200);
  });

  it('rota sem token nunca responde 200 (401)', async () => {
    const res = await request(app).get('/competicoes');
    expect(res.status).toBe(401);
  });
});

describe('GET /competicoes/:id — não existe nunca vaza detalhe (404 genérico)', () => {
  it('id inexistente devolve 404, nunca 500', async () => {
    const { token } = await tokenVendedor();
    const res = await request(app).get(`/competicoes/${randomUUID()}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /temporadas/:id/ranking — Season Points, nunca faturamento (seção 16/43/99)', () => {
  it('id inexistente devolve 404', async () => {
    const { token } = await tokenVendedor();
    const res = await request(app).get(`/temporadas/${randomUUID()}/ranking`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('season real sem pontos ainda devolve ranking vazio, sempre 200', async () => {
    const { token, vendedor } = await tokenVendedor();
    const season = await criarSeason({ code: `season-rank-${randomUUID()}`, name: 'S', description: 'd', startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) }, vendedor.id);

    const res = await request(app).get(`/temporadas/${season.id}/ranking`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ranking).toEqual([]);
  });
});
