// Testes de integração (Postgres real) das rotas de Missões/Desafios — auth,
// IDOR entre vendedores, e confirmação de que não existe nenhuma rota de
// escrita controlada pelo cliente (seção 40 da Fatia 7: "não criar POST
// /missoes/:id/complete controlado pelo frontend" — todas as rotas são GET).
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa, criarMeta } from '../gamificacao/test-helpers';
import { garantirCatalogoMissoes } from '../missoes/test-helpers';

beforeAll(async () => {
  await garantirCatalogoMissoes();
});

async function tokenPara(vendedor: { id: string; empresaId: string; lojaId: string }) {
  return assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
}

describe('GET /missoes/ativas', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).get('/missoes/ativas');
    expect(res.status).toBe(401);
  });

  it('atribui e devolve as missões do vendedor autenticado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.missoes)).toBe(true);
    expect(res.body.missoes.length).toBeGreaterThan(0);
    // Nunca expõe vendedorId/empresaId/lojaId de ninguém na resposta.
    for (const m of res.body.missoes) {
      expect(m).not.toHaveProperty('vendedorId');
      expect(m).not.toHaveProperty('empresaId');
    }
  });
});

describe('GET /missoes/:id — IDOR', () => {
  it('vendedor B não consegue ver a missão de A via HTTP (404, não revela existência)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const tokenA = await tokenPara(vendedorA);
    const tokenB = await tokenPara(vendedorB);

    const ativasA = await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${tokenA}`);
    const missaoId = ativasA.body.missoes[0].id;

    const res = await request(app).get(`/missoes/${missaoId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    expect(res.body.type).toBe('not_found');
  });

  it('vendedor A consegue ver a própria missão', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const ativas = await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${token}`);
    const missaoId = ativas.body.missoes[0].id;

    const res = await request(app).get(`/missoes/${missaoId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(missaoId);
  });
});

describe('sem rota de escrita controlada pelo cliente (fraude/mass assignment)', () => {
  it('POST /missoes/:id/complete não existe (404)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);
    const ativas = await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${token}`);
    const missaoId = ativas.body.missoes[0].id;

    const res = await request(app)
      .post(`/missoes/${missaoId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'COMPLETED', progress: 100, rewardGranted: true, xp: 999999 });

    expect(res.status).toBe(404);
  });

  it('POST /missoes não existe (vendedor não pode criar a própria missão)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app)
      .post('/missoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'MISSAO_FACIL', title: 'fácil', vendedorId: vendedor.id, xp: 999999 });

    expect(res.status).toBe(404);
  });
});

describe('GET /desafios/ativos', () => {
  it('rejeita sem token e devolve desafios do vendedor autenticado', async () => {
    const semToken = await request(app).get('/desafios/ativos');
    expect(semToken.status).toBe(401);

    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);
    const res = await request(app).get('/desafios/ativos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.desafios.length).toBeGreaterThan(0);
  });
});

describe('progresso nunca calculado pelo cliente', () => {
  it('a resposta de /missoes/ativas nunca reflete um progresso "forjado" fora do que o backend calculou', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarMeta(vendedor.id, 1000, new Date(new Date().setHours(0, 0, 0, 0)));
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/missoes/ativas').set('Authorization', `Bearer ${token}`);
    const dailyGoal = res.body.missoes.find((m: { missao: { code: string } }) => m.missao.code === 'DAILY_GOAL');

    expect(dailyGoal.status).toBe('ASSIGNED'); // sem indicador real batido, nunca aparece como concluída
    expect(dailyGoal.progressoAtual).toBe(0);
  });
});
