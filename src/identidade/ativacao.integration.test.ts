// Fluxo completo de ativação de conta (Fatia 7.5A, seção 71/74): Admin
// pré-autoriza -> vendedor ativa (CPF + token) -> login funciona. Cobre
// também os casos de abuso: CPF errado, token expirado, replay do mesmo
// token, e isolamento entre empresas.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { preAutorizarVendedor } from './ativacao.service';

const CPF_1 = '23889513727';
const CPF_2 = '38668240501';

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({
    data: { empresaId, lojaId, matriculaErp: `ADM-${lojaId}-${Math.random()}`, nome: 'Admin Teste', senhaHash: 'x', papel: 'ADMIN' },
  });
  return { admin, token: assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' }) };
}

describe('Fluxo de ativação: pré-autorizar -> ativar -> login', () => {
  it('vendedor pré-autorizado consegue ativar com CPF + token corretos e loga em seguida', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { admin, token } = await tokenAdminDe(empresa.id, loja.id);

    const resPre = await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: loja.id, matriculaErp: 'NOVO001', nome: 'Novo Vendedor', cpf: CPF_1 });

    expect(resPre.status).toBe(201);
    expect(resPre.body.status).toBe('PENDING_ACTIVATION');
    expect(resPre.body.tokenAtivacao).toBeTruthy();

    // conta ainda não consegue logar (sem senha própria)
    const loginAntes = await request(app)
      .post('/auth/login')
      .send({ codigoErpLoja: loja.codigoErp, matriculaErp: 'NOVO001', senha: 'qualquer123' });
    expect(loginAntes.status).toBe(401);

    const resAtiva = await request(app).post('/auth/ativacao').send({
      codigoErpLoja: loja.codigoErp,
      cpf: '238.895.137-27', // formatado — backend normaliza
      token: resPre.body.tokenAtivacao,
      senha: 'senhaNova123',
    });

    expect(resAtiva.status).toBe(200);
    expect(resAtiva.body.token).toBeTruthy();
    expect(resAtiva.body.vendedor.nome).toBe('Novo Vendedor');

    const loginDepois = await request(app)
      .post('/auth/login')
      .send({ codigoErpLoja: loja.codigoErp, matriculaErp: 'NOVO001', senha: 'senhaNova123' });
    expect(loginDepois.status).toBe(200);

    const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: resPre.body.id } });
    expect(vendedor.status).toBe('ACTIVE');
    void admin;
  });

  it('CPF errado na ativação retorna erro genérico (nunca confirma se o CPF existe)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const resPre = await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: loja.id, matriculaErp: 'NOVO002', nome: 'Fulano', cpf: CPF_1 });

    const resAtiva = await request(app).post('/auth/ativacao').send({
      codigoErpLoja: loja.codigoErp,
      cpf: CPF_2, // CPF errado
      token: resPre.body.tokenAtivacao,
      senha: 'senhaNova123',
    });

    expect(resAtiva.status).toBe(400);
    expect(resAtiva.body.type).toBe('ativacao_invalida');
  });

  it('token expirado é rejeitado', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const resPre = await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: loja.id, matriculaErp: 'NOVO003', nome: 'Ciclana', cpf: CPF_1 });

    // expira manualmente (só o token deste vendedor) pra não depender de
    // esperar ACTIVATION_TOKEN_TTL_HOURS de verdade.
    await prisma.activationToken.updateMany({ where: { vendedorId: resPre.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const resAtiva = await request(app).post('/auth/ativacao').send({
      codigoErpLoja: loja.codigoErp,
      cpf: CPF_1,
      token: resPre.body.tokenAtivacao,
      senha: 'senhaNova123',
    });

    expect(resAtiva.status).toBe(400);
  });

  it('token já usado não pode ser reaproveitado (replay)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const resPre = await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: loja.id, matriculaErp: 'NOVO004', nome: 'Beltrana', cpf: CPF_1 });

    const payload = { codigoErpLoja: loja.codigoErp, cpf: CPF_1, token: resPre.body.tokenAtivacao, senha: 'senhaNova123' };

    const primeira = await request(app).post('/auth/ativacao').send(payload);
    expect(primeira.status).toBe(200);

    const segunda = await request(app).post('/auth/ativacao').send(payload);
    expect(segunda.status).toBe(400);
  });

  it('mesmo CPF em empresas diferentes não colide (unicidade é por empresa, não global)', async () => {
    const { empresa: empresaA, loja: lojaA, vendedor: atorA } = await criarFixtureEmpresa();
    const { empresa: empresaB, loja: lojaB, vendedor: atorB } = await criarFixtureEmpresa();

    const { vendedor: vA } = await preAutorizarVendedor({
      empresaId: empresaA.id,
      lojaId: lojaA.id,
      matriculaErp: 'X001',
      nome: 'Pessoa X',
      cpf: CPF_1,
      actorId: atorA.id,
    });
    const { vendedor: vB } = await preAutorizarVendedor({
      empresaId: empresaB.id,
      lojaId: lojaB.id,
      matriculaErp: 'X001',
      nome: 'Pessoa X (outra empresa)',
      cpf: CPF_1,
      actorId: atorB.id,
    });

    expect(vA.id).not.toBe(vB.id);
    expect(vA.empresaId).not.toBe(vB.empresaId);
  });

  it('CPF duplicado na MESMA empresa é rejeitado', async () => {
    const { empresa, loja, vendedor: ator } = await criarFixtureEmpresa();

    await preAutorizarVendedor({ empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'D001', nome: 'A', cpf: CPF_1, actorId: ator.id });

    await expect(
      preAutorizarVendedor({ empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'D002', nome: 'B', cpf: CPF_1, actorId: ator.id })
    ).rejects.toMatchObject({ type: 'cpf_duplicado' });
  });

  it('CPF estruturalmente inválido é rejeitado antes de criar qualquer registro', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();

    await expect(
      preAutorizarVendedor({ empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'INV001', nome: 'Inválido', cpf: '111.111.111-11', actorId: 'seed' })
    ).rejects.toMatchObject({ type: 'cpf_invalido' });
  });

  it('pré-autorização gera um AuditEvent USER_PREAUTHORIZED, e ativação gera USER_ACTIVATED', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const { token } = await tokenAdminDe(empresa.id, loja.id);

    const resPre = await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: loja.id, matriculaErp: 'AUD001', nome: 'Auditado', cpf: CPF_1 });

    await request(app).post('/auth/ativacao').send({
      codigoErpLoja: loja.codigoErp,
      cpf: CPF_1,
      token: resPre.body.tokenAtivacao,
      senha: 'senhaNova123',
    });

    const eventos = await prisma.auditEvent.findMany({ where: { targetId: resPre.body.id }, orderBy: { createdAt: 'asc' } });
    expect(eventos.map((e) => e.acao)).toEqual(['USER_PREAUTHORIZED', 'USER_ACTIVATED']);
  });
});

describe('POST /auth/senha — alterar senha autenticado', () => {
  it('exige a senha atual correta antes de trocar', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { senhaHash: await hashSenhaTeste('senhaAntiga123') } });
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });

    const errada = await request(app)
      .post('/auth/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'errada', novaSenha: 'novaSenha123' });
    expect(errada.status).toBe(401);

    const correta = await request(app)
      .post('/auth/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'senhaAntiga123', novaSenha: 'novaSenha123' });
    expect(correta.status).toBe(204);

    const login = await request(app).post('/auth/login').send({
      codigoErpLoja: (await prisma.loja.findUniqueOrThrow({ where: { id: vendedor.lojaId } })).codigoErp,
      matriculaErp: vendedor.matriculaErp,
      senha: 'novaSenha123',
    });
    expect(login.status).toBe(200);
  });
});

async function hashSenhaTeste(senha: string) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(senha, 10);
}
