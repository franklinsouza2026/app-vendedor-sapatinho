// Testes de integração (Postgres real) das rotas do Treinador — RBAC, IDOR
// entre vendedores, e o fluxo básico via HTTP (não só via service direto).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { getOrCreateConversaAtual } from '../treinador/conversation.service';

async function tokenPara(vendedor: { id: string; empresaId: string; lojaId: string }) {
  return assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
}

describe('GET /treinador/objections', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).get('/treinador/objections');
    expect(res.status).toBe(401);
  });

  it('retorna a lista de objeções comuns', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/treinador/objections').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.objections)).toBe(true);
    expect(res.body.objections.length).toBeGreaterThan(0);
    expect(res.body.objections[0]).toHaveProperty('code');
    expect(res.body.objections[0]).toHaveProperty('label');
  });
});

describe('GET /treinador/conversations/current e mensagens — IDOR', () => {
  it('vendedor A não consegue ver mensagens da conversa de B via HTTP (404, não 403 — não revela existência)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const conversaB = await getOrCreateConversaAtual(vendedorB.id);
    const tokenA = await tokenPara(vendedorA);

    const res = await request(app).get(`/treinador/conversations/${conversaB.id}/messages`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it('vendedor A não consegue mandar mensagem na conversa de B via HTTP', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const conversaB = await getOrCreateConversaAtual(vendedorB.id);
    const tokenA = await tokenPara(vendedorA);

    const res = await request(app)
      .post(`/treinador/conversations/${conversaB.id}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'tentando invadir a conversa de outro vendedor', mode: 'GERAL' });

    expect(res.status).toBe(404);
  });

  it('GET current sempre retorna a própria conversa do vendedor do token', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/treinador/conversations/current').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.vendedorId).toBe(vendedor.id);
  });
});

describe('POST /treinador/conversations/:id/messages — fluxo básico e validação', () => {
  it('envia mensagem e recebe resposta do Treinador via HTTP', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const atual = await request(app).get('/treinador/conversations/current').set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post(`/treinador/conversations/${atual.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'como faço pra abordar melhor?', mode: 'ABORDAGEM' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('ASSISTANT');
    expect(typeof res.body.content).toBe('string');
  });

  it('rejeita mensagem sem content', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);
    const atual = await request(app).get('/treinador/conversations/current').set('Authorization', `Bearer ${token}`);

    const res = await request(app).post(`/treinador/conversations/${atual.body.id}/messages`).set('Authorization', `Bearer ${token}`).send({ mode: 'GERAL' });
    expect(res.status).toBe(400);
  });

  it('rejeita modo inválido (mass assignment / valor fora do enum)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);
    const atual = await request(app).get('/treinador/conversations/current').set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/treinador/conversations/${atual.body.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'oi', mode: 'MODO_INEXISTENTE' });
    expect(res.status).toBe(400);
  });
});
