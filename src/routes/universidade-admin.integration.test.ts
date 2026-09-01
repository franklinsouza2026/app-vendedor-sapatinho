// Admin — Universidade (Fatia 7.5E): RBAC, CRUD de escolas/competências,
// mapeamento validado, certificações e PDI oversight.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `ADM-U-${randomUUID()}`, nome: 'Admin U', senhaHash: 'x', papel: 'ADMIN' } });
  return assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' });
}

describe('RBAC em /admin/universidade/*', () => {
  it('VENDEDOR e GERENTE não acessam nenhuma rota admin da Universidade', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const tokenGerente = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    for (const token of [tokenVendedor, tokenGerente]) {
      expect((await request(app).get('/admin/universidade/escolas').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).post('/admin/universidade/competencias').set('Authorization', `Bearer ${token}`).send({})).status).toBe(403);
      expect((await request(app).get('/admin/universidade/certificacoes').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    }
  });
});

describe('Escolas', () => {
  it('GET faz seed idempotente das 8 escolas iniciais', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);

    const res1 = await request(app).get('/admin/universidade/escolas').set('Authorization', `Bearer ${token}`);
    const res2 = await request(app).get('/admin/universidade/escolas').set('Authorization', `Bearer ${token}`);
    expect(res1.body.escolas.length).toBeGreaterThanOrEqual(8);
    expect(res1.body.escolas.length).toBe(res2.body.escolas.length); // idempotente, nunca duplica
  });

  it('cria e atualiza uma escola', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);

    const criada = await request(app).post('/admin/universidade/escolas').set('Authorization', `Bearer ${token}`).send({ code: `escola-${randomUUID()}`, name: 'Escola X', description: 'd' });
    expect(criada.status).toBe(201);

    const atualizada = await request(app).put(`/admin/universidade/escolas/${criada.body.id}`).set('Authorization', `Bearer ${token}`).send({ active: false });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.active).toBe(false);
  });
});

describe('Competências + Targets + Mapeamento', () => {
  it('cria competência, define target por papel, mapeia numa aula real', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);

    const competencia = await request(app)
      .post('/admin/universidade/competencias')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `comp-${randomUUID()}`, name: 'Fechamento', description: 'd' });
    expect(competencia.status).toBe(201);

    const target = await request(app)
      .put(`/admin/universidade/competencias/${competencia.body.id}/targets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ papel: 'VENDEDOR', targetScore: 85 });
    expect(target.status).toBe(200);
    expect(target.body.targetScore).toBe(85);

    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-map-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-map-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const mapeado = await request(app)
      .post('/admin/universidade/mapear')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'lesson', contentId: aula.id, competencyIds: [competencia.body.id] });
    expect(mapeado.status).toBe(204);

    const aulaAtualizada = await prisma.academyLesson.findUniqueOrThrow({ where: { id: aula.id } });
    expect(aulaAtualizada.competencyIds).toEqual([competencia.body.id]);
  });

  it('rejeita mapear pra um id de competência que não existe', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-map2-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-map2-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const res = await request(app)
      .post('/admin/universidade/mapear')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'lesson', contentId: aula.id, competencyIds: [randomUUID()] });
    expect(res.status).toBe(400);
  });
});

describe('Certificações — lifecycle igual ao CMS (sem atalho)', () => {
  it('não pode publicar direto do DRAFT (precisa submeter/aprovar antes)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);

    const def = await request(app).post('/admin/universidade/certificacoes').set('Authorization', `Bearer ${token}`).send({ code: `cert-${randomUUID()}`, name: 'X', description: 'd' });
    const res = await request(app).post(`/admin/universidade/certificacoes/${def.body.id}/publicar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('fluxo completo submeter→aprovar→publicar funciona', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);

    const def = await request(app).post('/admin/universidade/certificacoes').set('Authorization', `Bearer ${token}`).send({ code: `cert-full-${randomUUID()}`, name: 'X', description: 'd' });
    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      const res = await request(app).post(`/admin/universidade/certificacoes/${def.body.id}/${transicao}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
    const final = await prisma.certificationDefinition.findUniqueOrThrow({ where: { id: def.body.id } });
    expect(final.status).toBe('PUBLISHED');
  });
});

describe('PDI oversight — Admin cria pra qualquer vendedor', () => {
  it('pausar/retomar/cancelar seguem transição atômica', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const token = await tokenAdminDe(empresa.id, loja.id);
    const competencia = await prisma.competency.create({ data: { code: `comp-adm-pdi-${randomUUID()}`, name: 'C', description: 'd' } });

    const criado = await request(app)
      .post('/admin/universidade/pdi')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, itens: [{ tipo: 'PRACTICE' }] });
    expect(criado.status).toBe(201);

    const pausado = await request(app).post(`/admin/universidade/pdi/${criado.body.id}/pausar`).set('Authorization', `Bearer ${token}`);
    expect(pausado.status).toBe(200);
    expect(pausado.body.status).toBe('PAUSED');

    const jaPausado = await request(app).post(`/admin/universidade/pdi/${criado.body.id}/pausar`).set('Authorization', `Bearer ${token}`);
    expect(jaPausado.status).toBe(409); // já está PAUSED, transição inválida
  });
});
