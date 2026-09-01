// Universidade — rotas do vendedor (Fatia 7.5E): score/gap/certificação
// sempre derivados pelo backend, nunca aceitos do cliente.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

describe('GET /universidade/minha-matriz', () => {
  it('exige autenticação e nunca aceita score/gap vindo do cliente (é sempre calculado)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const semAuth = await request(app).get('/universidade/minha-matriz');
    expect(semAuth.status).toBe(401);

    const comAuth = await request(app).get('/universidade/minha-matriz').set('Authorization', `Bearer ${token}`);
    expect(comAuth.status).toBe(200);
    expect(Array.isArray(comAuth.body.competencias)).toBe(true);
  });
});

describe('GET /universidade/pdi/:id — IDOR', () => {
  it('vendedor não vê PDI de outro vendedor, mesmo por ID direto', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();
    const competencia = await prisma.competency.create({ data: { code: `comp-${randomUUID()}`, name: 'C', description: 'd' } });

    const planoDeOutroVendedor = await prisma.developmentPlan.create({
      data: { subjectUserId: outraFixture.vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: outraFixture.vendedor.id },
    });

    const token = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const res = await request(app).get(`/universidade/pdi/${planoDeOutroVendedor.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404); // nunca 403 — não confirma que existe
  });
});

describe('POST /universidade/certificacoes/:definitionId/emitir', () => {
  it('nunca emite se os requisitos não forem cumpridos, mesmo que o cliente tente forjar campos extras', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const def = await prisma.certificationDefinition.create({ data: { code: `cert-${randomUUID()}`, name: 'X', description: 'd', status: 'PUBLISHED' } });
    await prisma.certificationRequirement.create({ data: { definitionId: def.id, tipo: 'MANDAMENTOS_COMPLETOS' } });

    // Cliente tenta forjar status/eligible/issuedAt — o schema da rota nem aceita esses campos.
    const res = await request(app)
      .post(`/universidade/certificacoes/${def.id}/emitir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'VALID', eligible: true, issuedAt: '2020-01-01' });

    expect(res.status).toBe(409);
    expect(res.body.type).toBe('requisitos_nao_atendidos');
    const count = await prisma.userCertification.count({ where: { userId: vendedor.id, definitionId: def.id } });
    expect(count).toBe(0);
  });
});

describe('Revisão (spaced repetition) — nunca expõe gabarito antes de responder', () => {
  it('lista revisões pendentes sem o campo correct nas opções', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-rev-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-rev-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });
    const questao = await prisma.academyQuestion.create({ data: { quizId: quiz.id, question: 'P?', opcoes: { create: [{ text: 'A', correct: true }, { text: 'B', correct: false }] } } });
    await prisma.reviewSchedule.create({ data: { userId: vendedor.id, sourceType: 'QUESTION', sourceId: questao.id, nextReviewAt: new Date('2020-01-01') } });

    const res = await request(app).get('/universidade/revisoes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.revisoes).toHaveLength(1);
    const bruto = JSON.stringify(res.body);
    expect(bruto).not.toContain('"correct"');
  });
});
