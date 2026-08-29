// Testes de integração (Postgres real) das rotas do Coach — RBAC, IDOR entre
// vendedores, e o fluxo básico via HTTP (não só via service direto).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { getOrCreateConversaAtual } from '../coach/conversation.service';

async function tokenPara(vendedor: { id: string; empresaId: string; lojaId: string }) {
  return assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
}

describe('POST /coach/check-in', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).post('/coach/check-in').send({ mood: 'GOOD' });
    expect(res.status).toBe(401);
  });

  it('registra o check-in do vendedor autenticado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).post('/coach/check-in').set('Authorization', `Bearer ${token}`).send({ mood: 'NOT_GOOD' });

    expect(res.status).toBe(201);
    expect(res.body.mood).toBe('NOT_GOOD');
  });

  it('rejeita mood inválido', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).post('/coach/check-in').set('Authorization', `Bearer ${token}`).send({ mood: 'MUITO_TRISTE' });
    expect(res.status).toBe(400);
  });
});

describe('GET /coach/conversations/current e mensagens — IDOR', () => {
  it('vendedor A não consegue ver mensagens da conversa de B via HTTP (404, não 403 — não revela existência)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const conversaB = await getOrCreateConversaAtual(vendedorB.id);
    const tokenA = await tokenPara(vendedorA);

    const res = await request(app).get(`/coach/conversations/${conversaB.id}/messages`).set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('vendedor A não consegue mandar mensagem na conversa de B via HTTP', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const conversaB = await getOrCreateConversaAtual(vendedorB.id);
    const tokenA = await tokenPara(vendedorA);

    const res = await request(app)
      .post(`/coach/conversations/${conversaB.id}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'tentando invadir a conversa de outro vendedor' });

    expect(res.status).toBe(404);
  });

  it('GET current sempre retorna a própria conversa do vendedor do token', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/coach/conversations/current').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vendedorId).toBe(vendedor.id);
  });
});

describe('POST /coach/conversations/:id/messages — fluxo básico', () => {
  it('envia mensagem e recebe resposta do Coach via HTTP', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const atual = await request(app).get('/coach/conversations/current').set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post(`/coach/conversations/${atual.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'oi, como estou hoje?' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ASSISTANT');
    expect(typeof res.body.content).toBe('string');
  });

  it('rejeita mensagem sem content', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);
    const atual = await request(app).get('/coach/conversations/current').set('Authorization', `Bearer ${token}`);

    const res = await request(app).post(`/coach/conversations/${atual.body.id}/messages`).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});
