// Ciclo de vida da conta (Fatia 7.5A, seções 12-14, 71): bloquear/desbloquear/
// desligar/reativar nunca apagam histórico, e um JWT emitido ANTES do
// bloqueio para de funcionar (requireAuth agora confere status no banco a
// cada request, não só a assinatura do token).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from '../gamificacao/test-helpers';
import { concederMoeda } from '../gamificacao/ledger.service';

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({
    data: { empresaId, lojaId, matriculaErp: `ADM-${Math.random()}`, nome: 'Admin', senhaHash: 'x', papel: 'ADMIN' },
  });
  return assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' });
}

describe('Bloqueio/desbloqueio de conta', () => {
  it('JWT emitido ANTES do bloqueio deixa de funcionar imediatamente após bloquear', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const antes = await request(app).get('/auth/me').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(antes.status).toBe(200);

    const bloquear = await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(bloquear.status).toBe(200);
    expect(bloquear.body.statusNovo).toBe('BLOCKED');

    // MESMO token de antes, sem novo login — precisa parar de funcionar.
    const depois = await request(app).get('/auth/me').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(depois.status).toBe(401);

    const desbloquear = await request(app).post(`/admin/vendedores/${vendedor.id}/desbloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(desbloquear.status).toBe(200);

    const restaurado = await request(app).get('/auth/me').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(restaurado.status).toBe(200);
  });

  it('ADMIN não pode bloquear/desligar a própria conta (evita autotravamento sem outro admin pra reverter)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    const bloquear = await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(bloquear.status).toBe(400);
    expect(bloquear.body.type).toBe('nao_pode_afetar_a_propria_conta');

    const desligar = await request(app).post(`/admin/vendedores/${vendedor.id}/desligar`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(desligar.status).toBe(400);

    const aindaAtivo = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedor.id } });
    expect(aindaAtivo.status).toBe('ACTIVE');
  });

  it('não pode bloquear quem já não está ativo (transição inválida)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    const segunda = await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);

    expect(segunda.status).toBe(409);
  });
});

describe('Desligamento/reativação preservam histórico', () => {
  it('desligar impede login mas preserva vendas/XP/moedas/metas — reativar restaura o acesso sem perder nada', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    await criarMeta(vendedor.id, 1000, new Date());
    await criarIndicador(vendedor.id, new Date(), { faturamento: 500 });
    await concederMoeda(
      {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId: vendedor.id,
        tipoEvento: 'AJUSTE_MANUAL',
        idempotencyKey: `hist-${vendedor.id}`,
        regraVersao: 1,
        ocorridoEm: new Date(),
      },
      42
    );

    const desligar = await request(app).post(`/admin/vendedores/${vendedor.id}/desligar`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(desligar.status).toBe(200);
    expect(desligar.body.statusNovo).toBe('OFFBOARDED');

    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const semAcesso = await request(app).get('/auth/me').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(semAcesso.status).toBe(401);

    // histórico intacto — nada foi apagado.
    const metas = await prisma.meta.findMany({ where: { vendedorId: vendedor.id } });
    const indicadores = await prisma.indicadorRealizado.findMany({ where: { vendedorId: vendedor.id } });
    const transacoes = await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id } });
    expect(metas).toHaveLength(1);
    expect(indicadores).toHaveLength(1);
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].valor).toBe(42);

    const reativar = await request(app).post(`/admin/vendedores/${vendedor.id}/reativar`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(reativar.status).toBe(200);
    expect(reativar.body.statusNovo).toBe('ACTIVE');

    const tokenNovo = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const comAcesso = await request(app).get('/auth/me').set('Authorization', `Bearer ${tokenNovo}`);
    expect(comAcesso.status).toBe(200);

    // moedas de antes do desligamento continuam lá após a reativação.
    const saldoDepois = await prisma.moedaTransacao.findMany({ where: { vendedorId: vendedor.id } });
    expect(saldoDepois).toHaveLength(1);
  });

  it('cada ação de ciclo de vida gera um AuditEvent com estado anterior/novo', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    await request(app).post(`/admin/vendedores/${vendedor.id}/desbloquear`).set('Authorization', `Bearer ${tokenAdmin}`);
    await request(app).post(`/admin/vendedores/${vendedor.id}/desligar`).set('Authorization', `Bearer ${tokenAdmin}`);
    await request(app).post(`/admin/vendedores/${vendedor.id}/reativar`).set('Authorization', `Bearer ${tokenAdmin}`);

    const eventos = await prisma.auditEvent.findMany({ where: { targetId: vendedor.id }, orderBy: { createdAt: 'asc' } });
    expect(eventos.map((e) => e.acao)).toEqual(['USER_BLOCKED', 'USER_UNBLOCKED', 'USER_OFFBOARDED', 'USER_REACTIVATED']);
    for (const e of eventos) {
      expect(e.metadata).toHaveProperty('estadoAnterior');
      expect(e.metadata).toHaveProperty('estadoNovo');
    }
  });
});

describe('RBAC/tenant isolation em /admin/vendedores', () => {
  it('VENDEDOR comum não acessa nenhuma rota /admin/*', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });

    const listar = await request(app).get('/admin/vendedores').set('Authorization', `Bearer ${token}`);
    expect(listar.status).toBe(403);

    const bloquear = await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${token}`);
    expect(bloquear.status).toBe(403);

    const auditoria = await request(app).get('/admin/auditoria').set('Authorization', `Bearer ${token}`);
    expect(auditoria.status).toBe(403);
  });

  it('GERENTE só lista/vê vendedores da PRÓPRIA loja, nunca de outra loja da mesma empresa', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Outra Loja', codigoErp: `OUTRA-${vendedor.id}` } });
    const vendedorOutraLoja = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: `Y-${vendedor.id}`, nome: 'Da outra loja', senhaHash: 'x' },
    });
    const gerente = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `GER-${vendedor.id}`, nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' },
    });
    const tokenGerente = assinarToken({ vendedorId: gerente.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    const lista = await request(app).get('/admin/vendedores').set('Authorization', `Bearer ${tokenGerente}`);
    expect(lista.status).toBe(200);
    expect(lista.body.vendedores.some((v: { id: string }) => v.id === vendedorOutraLoja.id)).toBe(false);
    expect(lista.body.vendedores.some((v: { id: string }) => v.id === vendedor.id)).toBe(true);

    const detalheForaDaLoja = await request(app).get(`/admin/vendedores/${vendedorOutraLoja.id}`).set('Authorization', `Bearer ${tokenGerente}`);
    expect(detalheForaDaLoja.status).toBe(404); // 404 genérico, nunca 403 (anti-IDOR)
  });

  it('GERENTE não consegue bloquear/desligar (só ADMIN pode nesta fatia)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `GER2-${vendedor.id}`, nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' },
    });
    const tokenGerente = assinarToken({ vendedorId: gerente.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    const res = await request(app).post(`/admin/vendedores/${vendedor.id}/bloquear`).set('Authorization', `Bearer ${tokenGerente}`);
    expect(res.status).toBe(403);
  });

  it('nunca vê/afeta vendedor de OUTRA empresa (tenant isolation), mesmo como ADMIN', async () => {
    const { empresa: empresaA, loja: lojaA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const tokenAdminA = await tokenAdminDe(empresaA.id, lojaA.id);

    const detalhe = await request(app).get(`/admin/vendedores/${vendedorB.id}`).set('Authorization', `Bearer ${tokenAdminA}`);
    expect(detalhe.status).toBe(404);

    const bloquear = await request(app).post(`/admin/vendedores/${vendedorB.id}/bloquear`).set('Authorization', `Bearer ${tokenAdminA}`);
    expect(bloquear.status).toBe(404);

    const vendedorAindaAtivo = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorB.id } });
    expect(vendedorAindaAtivo.status).toBe('ACTIVE');
  });

  it('lista de vendedores nunca inclui CPF completo, só a máscara', async () => {
    const { empresa, loja, vendedor: ator } = await criarFixtureEmpresa();
    const tokenAdmin = assinarToken({ vendedorId: ator.id, empresaId: empresa.id, lojaId: loja.id, papel: 'ADMIN' });

    await request(app)
      .post('/admin/vendedores')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ lojaId: loja.id, matriculaErp: 'CPFTEST', nome: 'Com CPF', cpf: '55484700272' });

    const lista = await request(app).get('/admin/vendedores').set('Authorization', `Bearer ${tokenAdmin}`);
    const bruto = JSON.stringify(lista.body);
    expect(bruto).not.toContain('55484700272');
    const linha = lista.body.vendedores.find((v: { matriculaErp: string }) => v.matriculaErp === 'CPFTEST');
    expect(linha.cpfMascarado).toBe('***.***.***-72');
  });
});

describe('Realocação de loja (Fatia 9.6, seção 11) — prospectiva, nunca reescreve histórico', () => {
  it('ADMIN realoca um vendedor pra outra loja da mesma empresa — histórico anterior preserva o lojaId antigo', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Segunda Loja', codigoErp: `L2-${Math.random()}` } });
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    await criarMeta(vendedor.id, 1000, new Date());
    await criarIndicador(vendedor.id, new Date(), { faturamento: 500 });
    const indicadorAntesRealocacao = await prisma.indicadorRealizado.findFirstOrThrow({ where: { vendedorId: vendedor.id } });

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/realocar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ novaLojaId: outraLoja.id });

    expect(res.status).toBe(200);
    const atualizado = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedor.id } });
    expect(atualizado.lojaId).toBe(outraLoja.id);

    // Histórico já gravado nunca é reescrito retroativamente.
    const indicadorDepois = await prisma.indicadorRealizado.findUniqueOrThrow({ where: { id: indicadorAntesRealocacao.id } });
    expect(indicadorDepois.lojaId).toBe(loja.id);

    const evento = await prisma.auditEvent.findFirst({ where: { empresaId: empresa.id, acao: 'USER_RELOCATED', targetId: vendedor.id } });
    expect(evento).not.toBeNull();
  });

  it('nunca realoca pra loja de outra empresa (400)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/realocar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ novaLojaId: outraFixture.loja.id });

    expect(res.status).toBe(400);
  });

  it('matrícula já existente na loja de destino é rejeitada (409, nunca sobrescreve)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Segunda Loja', codigoErp: `L2-${Math.random()}` } });
    await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: outraLoja.id, matriculaErp: vendedor.matriculaErp, nome: 'Colisão', senhaHash: 'x' } });
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/realocar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ novaLojaId: outraLoja.id });

    expect(res.status).toBe(409);
  });

  it('GERENTE nunca realoca (só ADMIN)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Segunda Loja', codigoErp: `L2-${Math.random()}` } });
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `GER-${Math.random()}`, nome: 'G', senhaHash: 'x', papel: 'GERENTE' } });
    const tokenGerente = assinarToken({ vendedorId: gerente.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    const res = await request(app)
      .post(`/admin/vendedores/${vendedor.id}/realocar`)
      .set('Authorization', `Bearer ${tokenGerente}`)
      .send({ novaLojaId: outraLoja.id });

    expect(res.status).toBe(403);
  });
});

describe('GET /admin/estrutura (Fatia 9.6, seção 10) — Loja -> Gerente(s) -> Vendedor(es)', () => {
  it('monta a árvore da empresa a partir dos vínculos reais, nunca de outra empresa', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `GER-${Math.random()}`, nome: 'Gerente da Loja', senhaHash: 'x', papel: 'GERENTE' } });
    const outraFixture = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).get('/admin/estrutura').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);

    const linhaDaLoja = res.body.estrutura.find((e: { loja: { id: string } }) => e.loja.id === loja.id);
    expect(linhaDaLoja.gerentes.map((g: { id: string }) => g.id)).toContain(gerente.id);
    expect(linhaDaLoja.vendedores.map((v: { id: string }) => v.id)).toContain(vendedor.id);

    const idsDeOutraEmpresa = res.body.estrutura.flatMap((e: { vendedores: { id: string }[] }) => e.vendedores.map((v) => v.id));
    expect(idsDeOutraEmpresa).not.toContain(outraFixture.vendedor.id);
  });

  it('GERENTE nunca acessa a estrutura da empresa (só ADMIN)', async () => {
    const { empresa, loja, vendedor: gerente } = await criarFixtureEmpresa();
    const tokenGerente = assinarToken({ vendedorId: gerente.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    const res = await request(app).get('/admin/estrutura').set('Authorization', `Bearer ${tokenGerente}`);
    expect(res.status).toBe(403);
  });
});
