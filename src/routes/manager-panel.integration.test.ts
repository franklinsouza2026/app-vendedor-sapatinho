// Painel Gerencial — rotas HTTP (Fatia 9, seção 85-92/99-115). Cobre auth/
// RBAC, escopo por loja (anti-IDOR), mass-assignment e XSS end-to-end via
// supertest (não só no service).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../db';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';

async function criarGerente(empresaId: string, lojaId: string) {
  return prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `GER-${Math.random()}`, nome: 'Gerente HTTP', papel: 'GERENTE' } });
}

function token(vendedorId: string, empresaId: string, lojaId: string, papel: 'VENDEDOR' | 'GERENTE' | 'ADMIN') {
  return assinarToken({ vendedorId, empresaId, lojaId, papel });
}

describe('Auth/RBAC — rotas do gerente nunca respondem 200 sem GERENTE', () => {
  it('sem token -> 401', async () => {
    const res = await request(app).get('/gerente/home');
    expect(res.status).toBe(401);
  });

  it('token de VENDEDOR -> 403', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const res = await request(app).get('/gerente/home').set('Authorization', `Bearer ${token(vendedor.id, empresa.id, loja.id, 'VENDEDOR')}`);
    expect(res.status).toBe(403);
  });

  it('token de GERENTE -> 200 com storeSummary', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    await criarIndicador(vendedor.id, new Date(), { faturamento: 200 });

    const res = await request(app).get('/gerente/home').set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`);
    expect(res.status).toBe(200);
    expect(res.body.storeSummary).toBeDefined();
    expect(Array.isArray(res.body.alertasPrioritarios)).toBe(true);
  });
});

describe('Escopo por loja — anti-IDOR (seção 85-89)', () => {
  it('gerente de uma loja nunca acessa detalhe de vendedor de OUTRA loja (404 genérico)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const outraFixture = await criarFixtureEmpresa();

    const res = await request(app)
      .get(`/gerente/equipe/${outraFixture.vendedor.id}/detalhe`)
      .set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`);
    expect(res.status).toBe(404);
  });

  it('gerente de uma loja nunca acessa 1:1 criado na loja de OUTRO gerente (404)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const criado = await request(app)
      .post('/gerente/1a1')
      .set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`)
      .send({ sellerId: vendedor.id });
    expect(criado.status).toBe(201);

    const outraFixture = await criarFixtureEmpresa();
    const outroGerente = await criarGerente(outraFixture.empresa.id, outraFixture.loja.id);
    const res = await request(app)
      .get(`/gerente/1a1/${criado.body.id}`)
      .set('Authorization', `Bearer ${token(outroGerente.id, outraFixture.empresa.id, outraFixture.loja.id, 'GERENTE')}`);
    expect(res.status).toBe(404);
  });
});

describe('Mass-assignment — cliente nunca decide status/completed (seção 91)', () => {
  it('POST /gerente/planos-de-acao ignora um "status" enviado pelo cliente — sempre nasce DRAFT', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);

    const res = await request(app)
      .post('/gerente/planos-de-acao')
      .set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`)
      .send({ subjectType: 'STORE', title: 'Foco da semana', status: 'COMPLETED', completedAt: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
  });
});

describe('XSS — texto livre é sempre sanitizado end-to-end (seção 92)', () => {
  it('título/descrição do plano de ação nunca preservam tags HTML', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);

    const res = await request(app)
      .post('/gerente/planos-de-acao')
      .set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`)
      .send({ subjectType: 'STORE', title: '<script>alert(1)</script>Foco', itens: [{ tipo: 'CUSTOM_TEXT', descricao: '<img src=x onerror=alert(1)>texto' }] });

    expect(res.status).toBe(201);
    expect(res.body.title).not.toContain('<script>');
    expect(res.body.itens[0].descricao).not.toContain('<img');
  });
});

describe('Smoke — rotas principais nunca 500 mesmo sem dado nenhum', () => {
  it('equipe/alertas/pendencias/reuniao-do-dia/roteiro-sugerido respondem 200', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const auth = `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`;

    for (const path of ['/gerente/equipe', '/gerente/alertas', '/gerente/pendencias', '/gerente/reuniao-do-dia', '/gerente/1a1/roteiro-sugerido', '/gerente/follow-ups', '/gerente/planos-de-acao']) {
      const res = await request(app).get(path).set('Authorization', auth);
      expect(res.status, `esperava 200 em ${path}`).toBe(200);
    }
  });
});

describe('Admin — configuração de alertas (seção 66-70)', () => {
  it('ADMIN lista e atualiza thresholds; parâmetro desconhecido é rejeitado (nunca vira fórmula livre)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const admin = `Bearer ${token(vendedor.id, empresa.id, loja.id, 'ADMIN')}`;

    const listagem = await request(app).get('/admin/gerencial/alertas/config').set('Authorization', admin);
    expect(listagem.status).toBe(200);
    expect(listagem.body.configs.length).toBeGreaterThan(0);

    const atualizacao = await request(app)
      .put('/admin/gerencial/alertas/config/NO_SALES_RECENTLY')
      .set('Authorization', admin)
      .send({ ativo: true, parametros: { diasSemVenda: 3 } });
    expect(atualizacao.status).toBe(200);
    expect(atualizacao.body.versao).toBe(1);

    const invalido = await request(app)
      .put('/admin/gerencial/alertas/config/NO_SALES_RECENTLY')
      .set('Authorization', admin)
      .send({ ativo: true, parametros: { formulaLivre: 999 } });
    expect(invalido.status).toBe(400);
  });

  it('GERENTE nunca acessa a configuração de alertas (só ADMIN)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const res = await request(app).get('/admin/gerencial/alertas/config').set('Authorization', `Bearer ${token(gerente.id, empresa.id, loja.id, 'GERENTE')}`);
    expect(res.status).toBe(403);
  });
});
