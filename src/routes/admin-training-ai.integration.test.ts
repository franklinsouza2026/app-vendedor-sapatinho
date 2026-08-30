// Admin — IA de Treinamento (Fatia 7.5D): RBAC, isolamento de tenant, budget
// na criação, revisão humana (aprovar/rejeitar), e prova de que nada é
// publicado automaticamente nem exposto ao vendedor antes da revisão.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { executarJob } from '../training-intelligence/orchestrator.service';
import { ResearchSourceProvider, FonteEncontrada } from '../training-intelligence/research-source-provider';

class FakeSourceProvider implements ResearchSourceProvider {
  async search(): Promise<FonteEncontrada[]> {
    return [
      { url: 'https://mock-source.internal/x', title: 'Fonte de teste', publisher: 'Publisher', author: null, publishedAt: null, summary: 'resumo de teste', reliability: 'HIGH', rightsNotes: null },
    ];
  }
}

// 2+ fontes -> mock do Instructional Designer recomenda simulação também
// (ver gerarInstructionalDesign em mock-ai-provider.ts) — necessário pra
// exercitar o TrainingScenarioDraft gerado pelo Simulation Designer.
class FakeSourceProviderComDuasFontes implements ResearchSourceProvider {
  async search(): Promise<FonteEncontrada[]> {
    return [
      { url: 'https://mock-source.internal/x', title: 'Fonte 1', publisher: 'Publisher', author: null, publishedAt: null, summary: 'resumo 1', reliability: 'HIGH', rightsNotes: null },
      { url: 'https://mock-source.internal/y', title: 'Fonte 2', publisher: 'Publisher', author: null, publishedAt: null, summary: 'resumo 2', reliability: 'HIGH', rightsNotes: null },
    ];
  }
}

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({
    data: { empresaId, lojaId, matriculaErp: `ADM-TIA-${randomUUID()}`, nome: 'Admin TI', senhaHash: 'x', papel: 'ADMIN' },
  });
  return { token: assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' }), adminId: admin.id };
}

describe('RBAC em /admin/training/ai/*', () => {
  it('VENDEDOR e GERENTE não acessam nenhuma rota de IA de treinamento', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const tokenGerente = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    for (const token of [tokenVendedor, tokenGerente]) {
      expect((await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'x' })).status).toBe(403);
      expect((await request(app).get('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    }
  });
});

describe('Criação de job', () => {
  it('cria com topic estruturado e enfileira (202, status QUEUED)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'venda complementar' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('QUEUED');
    expect(res.body.topic).toBe('venda complementar');
  });

  it('aceita solicitação em linguagem natural como topic (seção 33/34 — tratado como dado)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app)
      .post('/admin/training/ai/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ naturalLanguageRequest: 'Crie um treinamento para vendedores sobre como aumentar venda complementar.' });
    expect(res.status).toBe(202);
    expect(res.body.topic).toContain('venda complementar');
  });

  it('idempotencyKey: 2 chamadas com a mesma chave devolvem o mesmo job (double-click)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const chave = `dup-${randomUUID()}`;

    const res1 = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'PA', idempotencyKey: chave });
    const res2 = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'PA', idempotencyKey: chave });
    expect(res2.body.id).toBe(res1.body.id);
  });

  it('budget esgotado bloqueia a criação com resposta segura (429) — nunca aceita um job pago sem orçamento', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token, adminId } = await tokenAdminDe(empresa.id, loja.id);
    await prisma.aIBudgetConfig.create({ data: { empresaId: empresa.id, monthlyLimitUSD: 0, updatedBy: adminId } });

    const res = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'x' });
    expect(res.status).toBe(429);
    expect(res.body.type).toBe('budget_exceeded');
  });

  it('ATUALIZACAO_CONTEUDO sem targetLessonId é rejeitado (400)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const res = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'x', type: 'ATUALIZACAO_CONTEUDO' });
    expect(res.status).toBe(400);
  });
});

describe('Isolamento de tenant', () => {
  it('Admin de uma empresa nunca vê nem age sobre job de outra empresa, mesmo por ID direto', async () => {
    const empresaA = await criarFixtureEmpresa();
    const empresaB = await criarFixtureEmpresa();
    const { token: tokenA } = await tokenAdminDe(empresaA.empresa.id, empresaA.loja.id);
    const { token: tokenB } = await tokenAdminDe(empresaB.empresa.id, empresaB.loja.id);

    const jobA = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${tokenA}`).send({ topic: 'tema da empresa A' });

    const detalheDeB = await request(app).get(`/admin/training/ai/jobs/${jobA.body.id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(detalheDeB.status).toBe(404);

    const cancelDeB = await request(app).post(`/admin/training/ai/jobs/${jobA.body.id}/cancel`).set('Authorization', `Bearer ${tokenB}`);
    expect(cancelDeB.status).toBe(404);

    const listaB = await request(app).get('/admin/training/ai/jobs').set('Authorization', `Bearer ${tokenB}`);
    expect(listaB.body.jobs.some((j: { id: string }) => j.id === jobA.body.id)).toBe(false);
  });
});

describe('Revisão humana — nunca publica sozinho', () => {
  it('job chega em WAITING_REVIEW; aprovar move pra COMPLETED sem publicar o rascunho; vendedor não vê o rascunho em nenhum momento', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'fechamento de venda' });
    await executarJob(criado.body.id, new FakeSourceProvider());

    const detalhe = await request(app).get(`/admin/training/ai/jobs/${criado.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(detalhe.body.job.status).toBe('WAITING_REVIEW');
    expect(detalhe.body.draftLesson.status).toBe('DRAFT');
    const lessonId = detalhe.body.draftLesson.id;

    // Vendedor nunca vê o rascunho, nem por ID direto — mesmo depois do
    // job terminar (nunca 403, sempre 404 genérico).
    const vistoPeloVendedor = await request(app).get(`/academia/aulas/${lessonId}`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(vistoPeloVendedor.status).toBe(404);

    const aprovado = await request(app).post(`/admin/training/ai/jobs/${criado.body.id}/review`).set('Authorization', `Bearer ${token}`).send({ outcome: 'APPROVED', notes: 'bom rascunho' });
    expect(aprovado.status).toBe(200);
    expect(aprovado.body.status).toBe('COMPLETED');
    expect(aprovado.body.reviewOutcome).toBe('APPROVED');

    // Aprovar o JOB não publica a aula sozinho — ainda precisa passar pelo
    // lifecycle normal do CMS (submeter/aprovar/publicar).
    const aulaAposAprovacao = await prisma.academyLesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(aulaAposAprovacao.status).toBe('DRAFT');

    // Ainda invisível ao vendedor mesmo com o job "aprovado".
    const vistoDepoisDeAprovado = await request(app).get(`/academia/aulas/${lessonId}`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(vistoDepoisDeAprovado.status).toBe(404);
  });

  it('rejeitar arquiva o rascunho — nunca aparece ao vendedor, histórico preservado', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'objeção de preço' });
    await executarJob(criado.body.id, new FakeSourceProvider());
    const detalhe = await request(app).get(`/admin/training/ai/jobs/${criado.body.id}`).set('Authorization', `Bearer ${token}`);
    const lessonId = detalhe.body.draftLesson.id;

    const rejeitado = await request(app).post(`/admin/training/ai/jobs/${criado.body.id}/review`).set('Authorization', `Bearer ${token}`).send({ outcome: 'REJECTED' });
    expect(rejeitado.status).toBe(200);
    expect(rejeitado.body.reviewOutcome).toBe('REJECTED');

    const aulaDepois = await prisma.academyLesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(aulaDepois.status).toBe('ARCHIVED');

    // Histórico preservado — job continua consultável, nunca apagado.
    const jobDepois = await request(app).get(`/admin/training/ai/jobs/${criado.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(jobDepois.status).toBe(200);
    expect(jobDepois.body.job.status).toBe('COMPLETED');
  });

  it('não é possível revisar um job que ainda não chegou em WAITING_REVIEW', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'ainda em fila' });

    const res = await request(app).post(`/admin/training/ai/jobs/${criado.body.id}/review`).set('Authorization', `Bearer ${token}`).send({ outcome: 'APPROVED' });
    expect(res.status).toBe(409);
  });
});

describe('Cancelamento', () => {
  it('cancela um job QUEUED; job já COMPLETED não pode mais ser cancelado', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'a cancelar' });
    const cancelado = await request(app).post(`/admin/training/ai/jobs/${criado.body.id}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(cancelado.status).toBe(200);
    expect(cancelado.body.status).toBe('CANCELLED');

    const segundoCancelamento = await request(app).post(`/admin/training/ai/jobs/${criado.body.id}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(segundoCancelamento.status).toBe(409);
  });
});

describe('Cenários de simulação (rascunho do Simulation Designer)', () => {
  it('fluxo completo: draft → submeter → aprovar → publicar materializa um SimulationScenario real', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'fechamento de venda complexo' });
    await executarJob(criado.body.id, new FakeSourceProviderComDuasFontes());

    const cenarios = await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${token}`);
    expect(cenarios.body.cenarios).toHaveLength(1);
    const cenarioId = cenarios.body.cenarios[0].id;
    expect(cenarios.body.cenarios[0].status).toBe('DRAFT');

    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      const res = await request(app).post(`/admin/training/ai/scenarios/${cenarioId}/${transicao}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }

    const final = await prisma.trainingScenarioDraft.findUniqueOrThrow({ where: { id: cenarioId } });
    expect(final.status).toBe('PUBLISHED');
    expect(final.publishedScenarioId).not.toBeNull();

    const cenarioReal = await prisma.simulationScenario.findUnique({ where: { id: final.publishedScenarioId! } });
    expect(cenarioReal).not.toBeNull();
    expect(cenarioReal!.title).toBe(final.title);
  });

  it('não pode pular etapa (DRAFT direto pra publicar)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'objeção difícil' });
    await executarJob(criado.body.id, new FakeSourceProviderComDuasFontes());
    const cenarios = await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${token}`);
    const cenarioId = cenarios.body.cenarios[0].id;

    const res = await request(app).post(`/admin/training/ai/scenarios/${cenarioId}/publicar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('publicação concorrente (2 chamadas simultâneas) nunca cria 2 SimulationScenario — só uma vence', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);
    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${token}`).send({ topic: 'venda casada avançada' });
    await executarJob(criado.body.id, new FakeSourceProviderComDuasFontes());
    const cenarios = await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${token}`);
    const cenarioId = cenarios.body.cenarios[0].id;
    for (const transicao of ['submeter', 'aprovar']) {
      await request(app).post(`/admin/training/ai/scenarios/${cenarioId}/${transicao}`).set('Authorization', `Bearer ${token}`);
    }

    const codeAntes = await prisma.simulationScenario.count();
    const [r1, r2] = await Promise.all([
      request(app).post(`/admin/training/ai/scenarios/${cenarioId}/publicar`).set('Authorization', `Bearer ${token}`),
      request(app).post(`/admin/training/ai/scenarios/${cenarioId}/publicar`).set('Authorization', `Bearer ${token}`),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const codeDepois = await prisma.simulationScenario.count();
    expect(codeDepois - codeAntes).toBe(1); // nunca 2 cenários órfãos
  });

  it('Admin de outra empresa não vê nem transiciona cenário alheio', async () => {
    const empresaA = await criarFixtureEmpresa();
    const empresaB = await criarFixtureEmpresa();
    const { token: tokenA } = await tokenAdminDe(empresaA.empresa.id, empresaA.loja.id);
    const { token: tokenB } = await tokenAdminDe(empresaB.empresa.id, empresaB.loja.id);

    const criado = await request(app).post('/admin/training/ai/jobs').set('Authorization', `Bearer ${tokenA}`).send({ topic: 'tema exclusivo da empresa A' });
    await executarJob(criado.body.id, new FakeSourceProviderComDuasFontes());
    const cenariosA = await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${tokenA}`);
    const cenarioId = cenariosA.body.cenarios[0].id;

    const listaB = await request(app).get('/admin/training/ai/scenarios').set('Authorization', `Bearer ${tokenB}`);
    expect(listaB.body.cenarios.some((c: { id: string }) => c.id === cenarioId)).toBe(false);

    const transicaoPorB = await request(app).post(`/admin/training/ai/scenarios/${cenarioId}/submeter`).set('Authorization', `Bearer ${tokenB}`);
    expect(transicaoPorB.status).toBe(404);
  });
});
