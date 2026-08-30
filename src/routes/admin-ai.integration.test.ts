// Admin AI Control Plane (Fatia 7.5B) — RBAC, tenant isolation, credenciais
// nunca expostas (seção 61/62), invariante de provider ativo único, e
// validação de modelo.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

const SEGREDO_TESTE = 'sk-super-secret-test-value';

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({
    data: { empresaId, lojaId, matriculaErp: `ADM-AI-${Math.random()}`, nome: 'Admin IA', senhaHash: 'x', papel: 'ADMIN' },
  });
  return { admin, token: assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' }) };
}

describe('RBAC/tenant isolation em /admin/ai', () => {
  it('VENDEDOR e GERENTE não acessam nenhuma rota /admin/ai/*', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const tokenGerente = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    for (const token of [tokenVendedor, tokenGerente]) {
      expect((await request(app).get('/admin/ai').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).put('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: 'x' })).status).toBe(403);
      expect((await request(app).post('/admin/ai/providers/MOCK/activate').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).put('/admin/ai/budget').set('Authorization', `Bearer ${token}`).send({ monthlyLimitUSD: 10 })).status).toBe(403);
      expect((await request(app).get('/admin/ai/usage').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    }
  });

  it('configuração de IA é isolada por empresa — Admin da empresa A nunca vê/afeta a configuração da empresa B', async () => {
    const { empresa: empresaA, loja: lojaA } = await criarFixtureEmpresa();
    const { empresa: empresaB, loja: lojaB } = await criarFixtureEmpresa();
    const { token: tokenAdminA } = await tokenAdminDe(empresaA.id, lojaA.id);
    const { token: tokenAdminB } = await tokenAdminDe(empresaB.id, lojaB.id);

    await request(app).post('/admin/ai/providers/MOCK/activate').set('Authorization', `Bearer ${tokenAdminA}`);
    await request(app).put('/admin/ai/budget').set('Authorization', `Bearer ${tokenAdminA}`).send({ monthlyLimitUSD: 999 });

    const visaoB = await request(app).get('/admin/ai').set('Authorization', `Bearer ${tokenAdminB}`);
    expect(visaoB.body.budget.monthlyLimitUSD).not.toBe(999);
  });
});

describe('Credenciais — write-only, nunca expostas', () => {
  it('PUT credential aceita a chave, mas GET /admin/ai nunca devolve o valor — só "configured: true"', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const put = await request(app)
      .put('/admin/ai/providers/OPENAI/credential')
      .set('Authorization', `Bearer ${token}`)
      .send({ apiKey: SEGREDO_TESTE });
    expect(put.status).toBe(204);

    const visao = await request(app).get('/admin/ai').set('Authorization', `Bearer ${token}`);
    const bruto = JSON.stringify(visao.body);
    expect(bruto).not.toContain(SEGREDO_TESTE);
    expect(bruto).not.toContain(Buffer.from(SEGREDO_TESTE).toString('base64'));

    const openai = visao.body.providers.find((p: { provider: string }) => p.provider === 'OPENAI');
    expect(openai.configured).toBe(true);

    void vendedor;
  });

  it('a credencial nunca é armazenada em claro no banco', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await request(app).put('/admin/ai/providers/ANTHROPIC/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: SEGREDO_TESTE });

    const linha = await prisma.aIProviderCredential.findUniqueOrThrow({ where: { empresaId_provider: { empresaId: empresa.id, provider: 'ANTHROPIC' } } });
    expect(linha.ciphertextBase64).not.toContain(SEGREDO_TESTE);
    expect(JSON.stringify(linha)).not.toContain(SEGREDO_TESTE);
  });

  it('DELETE credential remove e, se era o provider ativo, a empresa cai pra MOCK automaticamente', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await request(app).put('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: SEGREDO_TESTE });
    await request(app).post('/admin/ai/providers/OPENAI/activate').set('Authorization', `Bearer ${token}`);

    const del = await request(app).delete('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const visao = await request(app).get('/admin/ai').set('Authorization', `Bearer ${token}`);
    expect(visao.body.activeProvider).toBe('MOCK');
  });

  it('não pode ativar um provider real sem credencial configurada antes', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).post('/admin/ai/providers/GEMINI/activate').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('credencial_ausente');
  });
});

describe('Ativação — exatamente um provider ativo por vez', () => {
  it('ativar um segundo provider substitui o primeiro — nunca fica com 2 ativos', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await request(app).put('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: SEGREDO_TESTE });
    await request(app).post('/admin/ai/providers/OPENAI/activate').set('Authorization', `Bearer ${token}`);
    await request(app).post('/admin/ai/providers/MOCK/activate').set('Authorization', `Bearer ${token}`);

    const visao = await request(app).get('/admin/ai').set('Authorization', `Bearer ${token}`);
    const ativos = visao.body.providers.filter((p: { active: boolean }) => p.active);
    expect(ativos).toHaveLength(1);
    expect(ativos[0].provider).toBe('MOCK');
  });
});

describe('Modelo — governança (seção 44)', () => {
  it('rejeita modelo fora da lista permitida pro provider', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await request(app).put('/admin/ai/providers/ANTHROPIC/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: SEGREDO_TESTE });

    const res = await request(app)
      .put('/admin/ai/providers/ANTHROPIC/model')
      .set('Authorization', `Bearer ${token}`)
      .send({ model: 'gpt-5.1' }); // modelo de outro provider

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('modelo_invalido');
  });

  it('aceita um modelo da lista permitida', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).put('/admin/ai/providers/ANTHROPIC/model').set('Authorization', `Bearer ${token}`).send({ model: 'claude-haiku-4-5' });
    expect(res.status).toBe(204);
  });
});

describe('Budget e uso', () => {
  it('atualiza o budget mensal e gera auditoria', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).put('/admin/ai/budget').set('Authorization', `Bearer ${token}`).send({ monthlyLimitUSD: 42 });
    expect(res.status).toBe(204);

    const config = await prisma.aIBudgetConfig.findUniqueOrThrow({ where: { empresaId: empresa.id } });
    expect(Number(config.monthlyLimitUSD)).toBe(42);

    const evento = await prisma.auditEvent.findFirst({ where: { empresaId: empresa.id, acao: 'AI_BUDGET_CHANGED' } });
    expect(evento).not.toBeNull();
  });

  it('GET /admin/ai/usage retorna agregados por provider e especialista', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await prisma.aIUsage.create({
      data: {
        empresaId: empresa.id,
        vendedorId: vendedor.id,
        specialist: 'COACH',
        provider: 'mock',
        model: 'mock-v1',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUSD: 0,
        status: 'SUCESSO',
      },
    });

    const res = await request(app).get('/admin/ai/usage').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total.chamadas).toBeGreaterThanOrEqual(1);
    expect(res.body.porProvider.some((p: { provider: string }) => p.provider === 'mock')).toBe(true);
    expect(res.body.porEspecialista.some((e: { specialist: string }) => e.specialist === 'COACH')).toBe(true);
  });
});

describe('Auditoria de ações de IA', () => {
  it('cada ação crítica gera um AuditEvent, nunca com a credencial no metadata', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    await request(app).put('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`).send({ apiKey: SEGREDO_TESTE });
    await request(app).post('/admin/ai/providers/OPENAI/activate').set('Authorization', `Bearer ${token}`);
    await request(app).delete('/admin/ai/providers/OPENAI/credential').set('Authorization', `Bearer ${token}`);

    const eventos = await prisma.auditEvent.findMany({ where: { empresaId: empresa.id }, orderBy: { createdAt: 'asc' } });
    expect(eventos.map((e) => e.acao)).toEqual(['AI_PROVIDER_CREDENTIAL_SET', 'AI_PROVIDER_ACTIVATED', 'AI_PROVIDER_CREDENTIAL_REMOVED']);
    for (const e of eventos) {
      expect(JSON.stringify(e.metadata)).not.toContain(SEGREDO_TESTE);
    }
  });
});
