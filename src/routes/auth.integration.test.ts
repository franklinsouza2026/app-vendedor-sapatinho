// Testes de integração (Postgres real) para os endpoints de auth novos da
// Fatia 3: GET /lojas (público, pro formulário de login mobile) e GET /auth/me
// (reidrata sessão após F5/reabrir o PWA sem duplicar dado do token).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

describe('GET /lojas', () => {
  it('sem autenticação, com a empresa informada, responde 200 com as lojas ativas dela', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const res = await request(app).get(`/lojas?empresa=${empresa.id}`);
    expect(res.status).toBe(200);
    expect(res.body.lojas.map((l: { id: string }) => l.id)).toEqual([loja.id]);
  });

  it('com várias empresas no banco e nenhuma informada, NÃO adivinha o tenant — lista vazia (D8)', async () => {
    await criarFixtureEmpresa();
    await criarFixtureEmpresa();
    const res = await request(app).get('/lojas');
    expect(res.status).toBe(200);
    expect(res.body.lojas).toEqual([]);
  });

  it('nunca mistura lojas de empresas diferentes — regressão de tenant isolation', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const res = await request(app).get(`/lojas?empresa=${a.empresa.id}`);
    const ids = res.body.lojas.map((l: { id: string }) => l.id);
    expect(ids).toContain(a.loja.id);
    expect(ids).not.toContain(b.loja.id);
  });

  it('não expõe senha nem dado sensível de vendedor', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const res = await request(app).get(`/lojas?empresa=${empresa.id}`);
    const chaves = Object.keys(res.body.lojas[0] ?? {});
    expect(chaves).toEqual(expect.arrayContaining(['id', 'nome']));
    expect(chaves).not.toContain('senhaHash');
  });
});

describe('GET /auth/me', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('retorna vendedor + loja + empresa do PRÓPRIO token, nunca de parâmetro', async () => {
    const { vendedor, loja, empresa } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vendedor.id).toBe(vendedor.id);
    expect(res.body.loja.id).toBe(loja.id);
    expect(res.body.empresa.nome).toBe(empresa.nome);
    expect(res.body.vendedor.senhaHash).toBeUndefined();
  });

  it('retorna 401 (nunca derruba o processo) quando o vendedor do token foi desativado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { status: 'BLOCKED' } });
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('retorna 401 (nunca derruba o processo) quando o vendedor do token não existe mais', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
    await prisma.vendedor.delete({ where: { id: vendedor.id } });

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
