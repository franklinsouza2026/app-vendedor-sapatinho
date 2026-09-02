// Competições — rotas do Admin (Fatia 8, seção 45-50/93/108). Sempre
// requireAuth('ADMIN'); nunca aceita winner/finalRank/rewardGranted do
// corpo — tudo isso é derivado internamente (seção 76/77).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

async function tokenAdmin() {
  const { empresa, loja, vendedor } = await criarFixtureEmpresa();
  return assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });
}

async function tokenVendedor() {
  const { empresa, loja, vendedor } = await criarFixtureEmpresa();
  return assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
}

describe('Admin competições — RBAC', () => {
  it('VENDEDOR não acessa nenhuma rota admin de competições', async () => {
    const token = await tokenVendedor();
    const res = await request(app).get('/admin/competicoes/seasons').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Admin competições — Season CRUD', () => {
  it('cria uma season DRAFT, agenda, ativa', async () => {
    const token = await tokenAdmin();
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const criada = await request(app).post('/admin/competicoes/seasons').set('Authorization', `Bearer ${token}`).send({ code: `s-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt });
    expect(criada.status).toBe(201);
    expect(criada.body.status).toBe('DRAFT');

    const agendada = await request(app).post(`/admin/competicoes/seasons/${criada.body.id}/agendar`).set('Authorization', `Bearer ${token}`);
    expect(agendada.status).toBe(200);
    expect(agendada.body.status).toBe('SCHEDULED');
  });

  it('rejeita endsAt <= startsAt (400)', async () => {
    const token = await tokenAdmin();
    const data = new Date().toISOString();
    const res = await request(app).post('/admin/competicoes/seasons').set('Authorization', `Bearer ${token}`).send({ code: `s-${randomUUID()}`, name: 'S', description: 'd', startsAt: data, endsAt: data });
    expect(res.status).toBe(400);
  });
});

describe('Admin competições — Competition, mass assignment protection (seção 76/77)', () => {
  it('nunca aceita winner/finalRank/rewardGranted no corpo de criação — campos são ignorados pelo schema Zod', async () => {
    const token = await tokenAdmin();
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post('/admin/competicoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `c-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, winner: 'forjado', finalRank: 1, rewardGranted: true, eligible: true });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT'); // nunca nasce FINISHED/com resultado, mesmo tentando forjar
    expect(res.body.winner).toBeUndefined();
    expect(res.body.rewardGranted).toBeUndefined();
  });

  it('rejeita metricType CUSTOM_RULE (sem calculador, seção 48)', async () => {
    const token = await tokenAdmin();
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post('/admin/competicoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `c-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CUSTOM_RULE', startsAt, endsAt });
    expect(res.status).toBe(400);
  });

  it('finalizar uma competição que nunca foi ativada retorna 409, nunca gera resultado', async () => {
    const token = await tokenAdmin();
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const criada = await request(app)
      .post('/admin/competicoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `c-${randomUUID()}`, name: 'C', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt });

    const res = await request(app).post(`/admin/competicoes/${criada.body.id}/finalizar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe('Admin competições — Leagues', () => {
  it('lista o seed v1 (Bronze/Prata/Ouro/Diamante) na primeira chamada', async () => {
    const token = await tokenAdmin();
    const res = await request(app).get('/admin/competicoes/ligas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ligas.length).toBeGreaterThanOrEqual(4);
  });
});
