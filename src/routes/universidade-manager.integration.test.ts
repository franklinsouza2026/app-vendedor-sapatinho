// Universidade — rotas do Manager (Fatia 7.5E, seção 61/91): GERENTE só
// acessa vendedores da própria loja, nunca cross-store, nunca 403 (sempre
// 404 genérico pra não confirmar que o vendedor existe em outra loja).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

async function criarGerente(empresaId: string, lojaId: string) {
  const gerente = await prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `GER-${randomUUID()}`, nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });
  return { gerente, token: assinarToken({ vendedorId: gerente.id, empresaId, lojaId, papel: 'GERENTE' }) };
}

describe('GET /universidade/equipe — escopo por loja', () => {
  it('gerente só vê vendedores da própria loja', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V-${randomUUID()}`, nome: 'Vendedor de outra loja', senhaHash: 'x' } });
    const { token } = await criarGerente(empresa.id, loja.id);

    const res = await request(app).get('/universidade/equipe').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.vendedores.some((v: { id: string }) => v.id === vendedor.id)).toBe(true);
    expect(res.body.vendedores.some((v: { id: string }) => v.id === vendedorDeOutraLoja.id)).toBe(false);
  });
});

describe('GET /universidade/equipe/:vendedorId/desenvolvimento — nunca cross-store', () => {
  it('gerente não acessa desenvolvimento de vendedor de outra loja (404 genérico)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA2-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V2-${randomUUID()}`, nome: 'V2', senhaHash: 'x' } });
    const { token } = await criarGerente(empresa.id, loja.id);

    const res = await request(app).get(`/universidade/equipe/${vendedorDeOutraLoja.id}/desenvolvimento`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('ADMIN não tem essa restrição — acessa qualquer loja da empresa', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA3-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V3-${randomUUID()}`, nome: 'V3', senhaHash: 'x' } });
    const admin = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `ADM-${randomUUID()}`, nome: 'Admin', senhaHash: 'x', papel: 'ADMIN' } });
    const tokenAdmin = assinarToken({ vendedorId: admin.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    const res = await request(app).get(`/universidade/equipe/${vendedorDeOutraLoja.id}/desenvolvimento`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /universidade/equipe/:vendedorId/avaliacoes — RBAC + escopo', () => {
  it('VENDEDOR não acessa nenhuma rota de gestão de equipe', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const res = await request(app).get('/universidade/equipe').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(res.status).toBe(403);
  });

  it('gerente não avalia vendedor de outra loja', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA4-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V4-${randomUUID()}`, nome: 'V4', senhaHash: 'x' } });
    const { token } = await criarGerente(empresa.id, loja.id);
    const competencia = await prisma.competency.create({ data: { code: `comp-mgr-${randomUUID()}`, name: 'C', description: 'd' } });

    const res = await request(app)
      .post(`/universidade/equipe/${vendedorDeOutraLoja.id}/avaliacoes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ competencyId: competencia.id, rating: 5 });
    expect(res.status).toBe(404);

    const count = await prisma.managerAssessment.count({ where: { subjectUserId: vendedorDeOutraLoja.id } });
    expect(count).toBe(0);
  });

  it('gerente registra avaliação da própria loja — vira evidência automaticamente', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token, gerente } = await criarGerente(empresa.id, loja.id);
    const competencia = await prisma.competency.create({ data: { code: `comp-mgr2-${randomUUID()}`, name: 'C', description: 'd' } });

    const res = await request(app)
      .post(`/universidade/equipe/${vendedor.id}/avaliacoes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ competencyId: competencia.id, rating: 4, evidenceNote: 'Bom atendimento' });
    expect(res.status).toBe(201);
    expect(res.body.authorId).toBe(gerente.id);

    const evidencia = await prisma.competencyEvidence.findFirst({ where: { subjectUserId: vendedor.id, competencyId: competencia.id, sourceType: 'MANAGER_ASSESSMENT' } });
    expect(evidencia).not.toBeNull();
    expect(evidencia!.normalizedScore).toBe(80); // rating 4/5 -> 80
  });

  it('gerente não avalia a si mesmo (achado do security review — autoavaliação nunca vira evidência real)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token, gerente } = await criarGerente(empresa.id, loja.id);
    const competencia = await prisma.competency.create({ data: { code: `comp-mgr-self-${randomUUID()}`, name: 'C', description: 'd' } });

    const res = await request(app)
      .post(`/universidade/equipe/${gerente.id}/avaliacoes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ competencyId: competencia.id, rating: 5 });
    expect(res.status).toBe(404); // papel:'VENDEDOR' no escopo já exclui o próprio gerente — 404 genérico, nunca revela o motivo

    const count = await prisma.managerAssessment.count({ where: { subjectUserId: gerente.id } });
    expect(count).toBe(0);
  });

  it('gerente não avalia outro gerente/admin da mesma loja (equipe é só VENDEDOR)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await criarGerente(empresa.id, loja.id);
    const outroGerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `GER2-${randomUUID()}`, nome: 'Outro Gerente', senhaHash: 'x', papel: 'GERENTE' } });
    const competencia = await prisma.competency.create({ data: { code: `comp-mgr-peer-${randomUUID()}`, name: 'C', description: 'd' } });

    const res = await request(app)
      .post(`/universidade/equipe/${outroGerente.id}/avaliacoes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ competencyId: competencia.id, rating: 5 });
    expect(res.status).toBe(404);
  });
});

describe('POST /universidade/equipe/:vendedorId/pdi — Gerente cria, mas não escolhe conteúdo inexistente', () => {
  it('rejeita item com sourceId que não existe (400)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token } = await criarGerente(empresa.id, loja.id);
    const competencia = await prisma.competency.create({ data: { code: `comp-mgr3-${randomUUID()}`, name: 'C', description: 'd' } });

    const res = await request(app)
      .post(`/universidade/equipe/${vendedor.id}/pdi`)
      .set('Authorization', `Bearer ${token}`)
      .send({ competencyId: competencia.id, targetScore: 80, itens: [{ tipo: 'LESSON', sourceId: randomUUID() }] });
    expect(res.status).toBe(400);
  });
});
