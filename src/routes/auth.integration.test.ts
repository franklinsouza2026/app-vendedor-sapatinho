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
  it('sem autenticação, responde 200 com uma lista de lojas', async () => {
    await criarFixtureEmpresa(); // garante que existe pelo menos 1 empresa/loja no banco de teste
    const res = await request(app).get('/lojas');
    expect(res.status).toBe(200);
    expect(res.body.lojas.length).toBeGreaterThan(0);
  });

  it('nunca mistura lojas de empresas diferentes (só a empresa mais antiga do deployment) — regressão de tenant isolation', async () => {
    const antes = await request(app).get('/lojas');
    const idsAntes = new Set(antes.body.lojas.map((l: { id: string }) => l.id));

    // cria uma empresa nova — como fixtures usam createdAt=now(), esta é mais
    // recente que qualquer empresa já existente no banco de teste
    const { loja: lojaNova } = await criarFixtureEmpresa();

    const depois = await request(app).get('/lojas');
    const idsDepois = new Set(depois.body.lojas.map((l: { id: string }) => l.id));

    expect(idsDepois).toEqual(idsAntes); // lista não muda — a loja da empresa nova não aparece
    expect(idsDepois.has(lojaNova.id)).toBe(false);
  });

  it('não expõe senha nem dado sensível de vendedor', async () => {
    const res = await request(app).get('/lojas');
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
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { ativo: false } });
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
