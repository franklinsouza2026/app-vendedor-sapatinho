// Rotas de gestão de metas (Fatia 9.7, P0) — cobre a BORDA HTTP, que é onde
// mora o bug de fuso que um teste de service sozinho não pegaria.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { assinarToken } from '../middlewares/auth';

/**
 * Cria um ator com o papel pedido E um vendedor-alvo separado na MESMA empresa.
 * Ator e alvo precisam ser pessoas distintas: meta comercial só se aplica a
 * VENDEDOR, então um ADMIN nunca é alvo da própria meta.
 */
async function tokenPara(papel: 'ADMIN' | 'GERENTE' | 'VENDEDOR') {
  const { empresa, loja, vendedor: ator } = await criarFixtureEmpresa();
  await prisma.vendedor.update({ where: { id: ator.id }, data: { papel } });

  const alvo = await prisma.vendedor.create({
    data: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: `ALVO-${ator.id.slice(0, 8)}`,
      nome: 'Vendedor Alvo',
      papel: 'VENDEDOR',
      status: 'ACTIVE',
      senhaHash: 'hash-nao-usado',
    },
  });

  const token = assinarToken({ vendedorId: ator.id, empresaId: empresa.id, lojaId: loja.id, papel });
  return { token, empresa, loja, ator, vendedor: alvo };
}

/** Data de hoje em `YYYY-MM-DD` local — igual ao que o `<input type="date">` envia. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('POST /admin/metas', () => {
  it('REGRESSÃO DE FUSO: cadastrar a meta de HOJE funciona (era recusada como "período encerrado" em UTC-3)', async () => {
    const { token, vendedor } = await tokenPara('ADMIN');

    const resposta = await request(app)
      .post('/admin/metas')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hojeLocal(), valorMeta: 1500 });

    expect(resposta.status).toBe(201);

    // E a meta cai no dia certo — a leitura do PRÓPRIO VENDEDOR tem que achá-la.
    const tokenDoVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
    const minhas = await request(app).get('/metas/minhas').set('Authorization', `Bearer ${tokenDoVendedor}`);
    expect(minhas.body.progresso.find((p: { periodo: string }) => p.periodo === 'DIA').metaFaturamento).toBe(1500);
  });

  it('rejeita data em formato inesperado em vez de interpretar torto', async () => {
    const { token, vendedor } = await tokenPara('ADMIN');

    const resposta = await request(app)
      .post('/admin/metas')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: '17/09/2026', valorMeta: 100 });

    expect(resposta.status).toBe(400);
  });

  it('GERENTE não cadastra meta — definir meta é decisão da empresa, não da loja', async () => {
    const { token: tokenGerente } = await tokenPara('GERENTE');
    const { vendedor } = await tokenPara('ADMIN');

    const resposta = await request(app)
      .post('/admin/metas')
      .set('Authorization', `Bearer ${tokenGerente}`)
      .send({ vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hojeLocal(), valorMeta: 500 });

    expect(resposta.status).toBe(403);
  });

  it('VENDEDOR não cadastra nem lista metas administrativas', async () => {
    const { token } = await tokenPara('VENDEDOR');

    expect((await request(app).get('/admin/metas').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).post('/admin/metas').set('Authorization', `Bearer ${token}`).send({})).status).toBe(403);
  });

  it('sem token, nenhuma rota de meta responde', async () => {
    expect((await request(app).get('/admin/metas')).status).toBe(401);
    expect((await request(app).post('/admin/metas').send({})).status).toBe(401);
  });

  it('valor negativo ou zerado é rejeitado antes de chegar no banco', async () => {
    const { token, vendedor } = await tokenPara('ADMIN');

    for (const valorMeta of [0, -50]) {
      const resposta = await request(app)
        .post('/admin/metas')
        .set('Authorization', `Bearer ${token}`)
        .send({ vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hojeLocal(), valorMeta });
      expect(resposta.status).toBe(400);
    }
  });

  it('cross-company pela rota devolve 404 genérico, nunca 200 nem detalhe do outro tenant', async () => {
    const { token } = await tokenPara('ADMIN');
    const outra = await criarFixtureEmpresa();

    const resposta = await request(app)
      .post('/admin/metas')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendedorId: outra.vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hojeLocal(), valorMeta: 900 });

    expect(resposta.status).toBe(404);
    expect(await prisma.meta.count({ where: { vendedorId: outra.vendedor.id } })).toBe(0);
  });
});
