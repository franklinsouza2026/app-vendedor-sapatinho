// Testes de integração (Postgres real) para RBAC e isolamento de tenant nas
// rotas de gamificação — casos críticos obrigatórios da seção 40 da fonte de
// verdade ("tenant A não acessa tenant B", "ranking respeita escopo").
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { concederMoeda } from '../gamificacao/ledger.service';

async function tokenPara(vendedor: { id: string; empresaId: string; lojaId: string; papel: 'VENDEDOR' | 'GERENTE' | 'ADMIN' }) {
  return assinarToken({
    vendedorId: vendedor.id,
    empresaId: vendedor.empresaId,
    lojaId: vendedor.lojaId,
    papel: vendedor.papel,
  });
}

describe('GET /gamificacao/carteira', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).get('/gamificacao/carteira');
    expect(res.status).toBe(401);
  });

  it('retorna sempre os dados do PRÓPRIO vendedor do token, nunca de outro id', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();

    await concederMoeda(
      {
        empresaId: vendedorB.empresaId,
        lojaId: vendedorB.lojaId,
        vendedorId: vendedorB.id,
        tipoEvento: 'AJUSTE_MANUAL',
        idempotencyKey: `teste-${vendedorB.id}`,
        regraVersao: 1,
        ocorridoEm: new Date(),
      },
      999
    );

    const tokenA = await tokenPara({ ...vendedorA, papel: 'VENDEDOR' });

    // mesmo tentando influenciar via query/body, a rota só usa req.auth.vendedorId
    const res = await request(app)
      .get('/gamificacao/carteira')
      .query({ vendedorId: vendedorB.id })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.saldoMoedas).toBe(0); // saldo de A, não os 999 creditados a B
  });
});

describe('GET /gamificacao/ranking — isolamento de tenant e escopo', () => {
  it('vendedor de uma empresa nunca vê ranking de outra empresa, mesmo pedindo escopo REDE', async () => {
    const { empresa: empresaA, vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();

    const referencia = new Date();
    referencia.setHours(0, 0, 0, 0);

    await prisma.rankingSnapshot.createMany({
      data: [
        {
          empresaId: vendedorA.empresaId,
          escopo: 'REDE',
          lojaId: null,
          tipo: 'SCORE_GERAL',
          periodo: 'DIA',
          referencia,
          vendedorId: vendedorA.id,
          posicao: 1,
          valor: 500,
          regraVersao: 1,
        },
        {
          empresaId: vendedorB.empresaId,
          escopo: 'REDE',
          lojaId: null,
          tipo: 'SCORE_GERAL',
          periodo: 'DIA',
          referencia,
          vendedorId: vendedorB.id,
          posicao: 1,
          valor: 999,
          regraVersao: 1,
        },
      ],
    });

    const tokenA = await tokenPara({ ...vendedorA, papel: 'VENDEDOR' });
    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'REDE', tipo: 'SCORE_GERAL' }).set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.ranking).toHaveLength(1);
    expect(res.body.ranking[0].vendedorId).toBe(vendedorA.id);
    expect(res.body.ranking.some((r: { valor: string }) => Number(r.valor) === 999)).toBe(false);
    expect(empresaA.id).not.toBe(vendedorB.empresaId);
  });

  it('escopo LOJA usa a loja do token, ignorando qualquer lojaId enviado pelo client', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const outraLoja = await prisma.loja.create({
      data: { empresaId: vendedor.empresaId, nome: 'Outra Loja', codigoErp: `OUTRA-${vendedor.id}` },
    });

    const referencia = new Date();
    referencia.setHours(0, 0, 0, 0);

    await prisma.rankingSnapshot.create({
      data: {
        empresaId: vendedor.empresaId,
        escopo: 'LOJA',
        lojaId: outraLoja.id, // ranking de OUTRA loja da mesma empresa
        tipo: 'SCORE_GERAL',
        periodo: 'DIA',
        referencia,
        vendedorId: vendedor.id,
        posicao: 1,
        valor: 777,
        regraVersao: 1,
      },
    });

    const token = await tokenPara({ ...vendedor, papel: 'VENDEDOR' });
    const res = await request(app)
      .get('/gamificacao/ranking')
      .query({ escopo: 'LOJA', tipo: 'SCORE_GERAL', lojaId: outraLoja.id }) // tenta forçar outra loja
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ranking).toHaveLength(0); // não retorna o snapshot da "outra loja"
  });
});

describe('POST /vendedores — RBAC', () => {
  it('vendedor comum não pode cadastrar outro vendedor (403)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara({ ...vendedor, papel: 'VENDEDOR' });

    const res = await request(app)
      .post('/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: vendedor.lojaId, matriculaErp: 'NOVO', nome: 'X', senha: 'senha1234' });

    expect(res.status).toBe(403);
  });

  it('admin não pode cadastrar vendedor em loja de outra empresa (403)', async () => {
    const { vendedor: admin } = await criarFixtureEmpresa();
    const { vendedor: outraEmpresaVendedor } = await criarFixtureEmpresa();
    const token = await tokenPara({ ...admin, papel: 'ADMIN' });

    const res = await request(app)
      .post('/vendedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ lojaId: outraEmpresaVendedor.lojaId, matriculaErp: 'NOVO', nome: 'X', senha: 'senha1234' });

    expect(res.status).toBe(403);
  });
});
