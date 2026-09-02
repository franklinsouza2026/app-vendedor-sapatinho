// Competições — rotas do Manager (Fatia 8, seção 51/65/90/92/96/106): manager
// só reconhece vendedor da própria loja, nunca cross-store; seller nunca
// acessa rota de gestão de equipe.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

async function criarGerente(empresaId: string, lojaId: string) {
  const gerente = await prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `GER-COMP-${randomUUID()}`, nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });
  return { gerente, token: assinarToken({ vendedorId: gerente.id, empresaId, lojaId, papel: 'GERENTE' }) };
}

describe('POST /equipe/:vendedorId/reconhecimentos — RBAC + escopo (seção 51/90/106)', () => {
  it('VENDEDOR não acessa nenhuma rota de gestão de equipe', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const res = await request(app).post(`/equipe/${vendedor.id}/reconhecimentos`).set('Authorization', `Bearer ${token}`).send({ tipo: 'PERFORMANCE' });
    expect(res.status).toBe(403);
  });

  it('gerente reconhece vendedor da própria loja', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token } = await criarGerente(empresa.id, loja.id);

    const res = await request(app).post(`/equipe/${vendedor.id}/reconhecimentos`).set('Authorization', `Bearer ${token}`).send({ tipo: 'PERFORMANCE', message: 'Muito bom!' });
    expect(res.status).toBe(201);

    const total = await prisma.recognition.count({ where: { subjectId: vendedor.id } });
    expect(total).toBe(1);
  });

  it('gerente NUNCA reconhece vendedor de outra loja (404 genérico, mesma disciplina anti-IDOR)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA-COMP-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V-COMP-${randomUUID()}`, nome: 'V2', senhaHash: 'x' } });
    const { token } = await criarGerente(empresa.id, loja.id);

    const res = await request(app).post(`/equipe/${vendedorDeOutraLoja.id}/reconhecimentos`).set('Authorization', `Bearer ${token}`).send({ tipo: 'PERFORMANCE' });
    expect(res.status).toBe(404);

    const total = await prisma.recognition.count({ where: { subjectId: vendedorDeOutraLoja.id } });
    expect(total).toBe(0);
  });

  it('ADMIN não tem restrição de loja', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const admin = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `ADM-COMP-${randomUUID()}`, nome: 'Admin', senhaHash: 'x', papel: 'ADMIN' } });
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja 2', codigoErp: `OUTRA2-COMP-${randomUUID()}` } });
    const vendedorDeOutraLoja = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `V2-COMP-${randomUUID()}`, nome: 'V3', senhaHash: 'x' } });
    const tokenAdmin = assinarToken({ vendedorId: admin.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    const res = await request(app).post(`/equipe/${vendedorDeOutraLoja.id}/reconhecimentos`).set('Authorization', `Bearer ${tokenAdmin}`).send({ tipo: 'PERFORMANCE' });
    expect(res.status).toBe(201);
  });

  it('mass assignment: campos extras no corpo (ex.: authorId forjado) são ignorados — sempre req.auth', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const { token, gerente } = await criarGerente(empresa.id, loja.id);
    const outroVendedorId = randomUUID();

    const res = await request(app)
      .post(`/equipe/${vendedor.id}/reconhecimentos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PERFORMANCE', authorId: outroVendedorId, subjectId: outroVendedorId });
    expect(res.status).toBe(201);
    expect(res.body.authorId).toBe(gerente.id); // nunca o authorId forjado no corpo
    expect(res.body.subjectId).toBe(vendedor.id); // nunca o subjectId do corpo — sempre o :vendedorId da URL, validado no escopo
  });
});
