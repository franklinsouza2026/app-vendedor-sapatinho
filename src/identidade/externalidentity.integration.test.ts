// Fundação do vínculo com ERP externo (Fatia 7.5A, seção 8/9) — só o modelo
// e a API administrativa, SEM nenhuma chamada real ao Linx (isso é Fatia 10).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

describe('POST/DELETE /admin/vendedores/:id/identidade-externa', () => {
  it('ADMIN vincula uma identidade LINX manual (fica VERIFIED de imediato) e gera auditoria', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ provider: 'LINX', externalSellerId: 'LINX-123', matchMethod: 'MANUAL' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('VERIFIED');

    const detalhe = await request(app).get(`/admin/vendedores/${vendedor.id}`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(detalhe.body.identidadesExternas).toEqual([{ provider: 'LINX', status: 'VERIFIED', matchMethod: 'MANUAL', verifiedAt: expect.any(String) }]);

    const evento = await prisma.auditEvent.findFirst({ where: { targetId: vendedor.id, acao: 'ERP_IDENTITY_LINKED' } });
    expect(evento).not.toBeNull();
  });

  it('vínculo por CPF/EXTERNAL_ID/SELLER_CODE fica PENDING (verificação automática é Fatia 10)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ provider: 'LINX', externalSellerId: 'LINX-456', matchMethod: 'EXTERNAL_ID' });

    expect(res.body.status).toBe('PENDING');
  });

  it('não permite 2 vínculos LINX pro mesmo vendedor sem desvincular antes', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    await request(app)
      .post(`/admin/vendedores/${vendedor.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ provider: 'LINX', matchMethod: 'MANUAL' });

    const duplicado = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ provider: 'LINX', matchMethod: 'MANUAL' });

    expect(duplicado.status).toBe(409);
  });

  it('desvincular remove o vínculo e gera auditoria ERP_IDENTITY_UNLINKED', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    await request(app)
      .post(`/admin/vendedores/${vendedor.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ provider: 'LINX', matchMethod: 'MANUAL' });

    const del = await request(app)
      .delete(`/admin/vendedores/${vendedor.id}/identidade-externa/LINX`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(del.status).toBe(204);

    const restantes = await prisma.externalIdentity.findMany({ where: { vendedorId: vendedor.id } });
    expect(restantes).toHaveLength(0);

    const evento = await prisma.auditEvent.findFirst({ where: { targetId: vendedor.id, acao: 'ERP_IDENTITY_UNLINKED' } });
    expect(evento).not.toBeNull();
  });

  it('não vincula identidade externa de vendedor de OUTRA empresa (tenant isolation)', async () => {
    const { empresa: empresaA, loja: lojaA, vendedor: adminA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const tokenAdminA = assinarToken({ vendedorId: adminA.id, empresaId: empresaA.id, lojaId: lojaA.id, papel: 'ADMIN' });

    const res = await request(app)
      .post(`/admin/vendedores/${vendedorB.id}/identidade-externa`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ provider: 'LINX', matchMethod: 'MANUAL' });

    expect(res.status).toBe(404);
  });
});

describe('GET /admin/auditoria', () => {
  it('ADMIN lista eventos de auditoria só da própria empresa, paginado', async () => {
    const { empresa, loja, vendedor: admin } = await criarFixtureEmpresa();
    const alvo = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `ALVO-${admin.id}`, nome: 'Alvo', senhaHash: 'x' },
    });
    const tokenAdmin = assinarToken({ vendedorId: admin.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    await request(app).post(`/admin/vendedores/${alvo.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    await request(app).post(`/admin/vendedores/${alvo.id}/desbloquear`).set('Authorization', `Bearer ${tokenAdmin}`);

    const res = await request(app).get('/admin/auditoria').query({ limite: 10 }).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.eventos.length).toBeGreaterThanOrEqual(2);
    expect(res.body.eventos.every((e: { empresaId: string }) => e.empresaId === empresa.id)).toBe(true);
  });

  it('GERENTE/VENDEDOR não acessam /admin/auditoria', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const tokenGerente = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    expect((await request(app).get('/admin/auditoria').set('Authorization', `Bearer ${tokenVendedor}`)).status).toBe(403);
    expect((await request(app).get('/admin/auditoria').set('Authorization', `Bearer ${tokenGerente}`)).status).toBe(403);
  });
});
