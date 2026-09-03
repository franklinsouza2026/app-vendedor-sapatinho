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

describe('GET /gamificacao/ranking — privacidade de faturamento (Fatia 7.5A, seção 30-34)', () => {
  async function fixtureComTresVendedores() {
    const { empresa, loja, vendedor: vendedorA } = await criarFixtureEmpresa();
    const vendedorB = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `B-${vendedorA.id}`, nome: 'Vendedor B', senhaHash: 'x' },
    });
    const vendedorC = await prisma.vendedor.create({
      data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `C-${vendedorA.id}`, nome: 'Vendedor C', senhaHash: 'x' },
    });

    const referencia = new Date();
    referencia.setHours(0, 0, 0, 0);

    await prisma.rankingSnapshot.createMany({
      data: [
        { empresaId: empresa.id, escopo: 'LOJA', lojaId: loja.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia, vendedorId: vendedorA.id, posicao: 1, valor: 3000, regraVersao: 1 },
        { empresaId: empresa.id, escopo: 'LOJA', lojaId: loja.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia, vendedorId: vendedorB.id, posicao: 2, valor: 2000, regraVersao: 1 },
        { empresaId: empresa.id, escopo: 'LOJA', lojaId: loja.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia, vendedorId: vendedorC.id, posicao: 3, valor: 500, regraVersao: 1 },
        // ranking não financeiro — nunca deve ser mascarado
        { empresaId: empresa.id, escopo: 'LOJA', lojaId: loja.id, tipo: 'PA', periodo: 'DIA', referencia, vendedorId: vendedorA.id, posicao: 1, valor: 5, regraVersao: 1 },
        { empresaId: empresa.id, escopo: 'LOJA', lojaId: loja.id, tipo: 'PA', periodo: 'DIA', referencia, vendedorId: vendedorB.id, posicao: 2, valor: 3, regraVersao: 1 },
      ],
    });

    return { vendedorA, vendedorB, vendedorC };
  }

  it('vendedor A vê o próprio faturamento e NUNCA o valor bruto de B/C — testado na resposta JSON crua da API', async () => {
    const { vendedorA, vendedorB, vendedorC } = await fixtureComTresVendedores();
    const tokenA = await tokenPara({ ...vendedorA, papel: 'VENDEDOR' });

    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'LOJA', tipo: 'FATURAMENTO' }).set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const porId = new Map(res.body.ranking.map((r: { vendedorId: string; valor: unknown }) => [r.vendedorId, r.valor]));
    expect(Number(porId.get(vendedorA.id))).toBe(3000);
    expect(porId.get(vendedorB.id)).toBeNull();
    expect(porId.get(vendedorC.id)).toBeNull();

    // nenhuma linha alheia carrega o campo "valor" com o faturamento bruto
    // (gapParaAnterior pode legitimamente conter os mesmos dígitos — ex.
    // "1500" — então o check é no campo, não numa busca cega na string toda).
    const bruto = JSON.stringify(res.body);
    expect(bruto).not.toContain('"valor":"2000"');
    expect(bruto).not.toContain('"valor":"500"');
  });

  it('vendedor B (posição 2), quando consulta o mesmo ranking, vê o próprio valor e o de A/C mascarados (inverso do caso anterior)', async () => {
    const { vendedorA, vendedorB, vendedorC } = await fixtureComTresVendedores();
    const tokenB = await tokenPara({ ...vendedorB, papel: 'VENDEDOR' });

    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'LOJA', tipo: 'FATURAMENTO' }).set('Authorization', `Bearer ${tokenB}`);

    const porId = new Map(res.body.ranking.map((r: { vendedorId: string; valor: unknown }) => [r.vendedorId, r.valor]));
    expect(Number(porId.get(vendedorB.id))).toBe(2000);
    expect(porId.get(vendedorA.id)).toBeNull();
    expect(porId.get(vendedorC.id)).toBeNull();
  });

  it('gapParaAnterior preserva "faltam R$X pra alcançar" sem nunca expor o valor absoluto de quem está acima', async () => {
    const { vendedorB } = await fixtureComTresVendedores();
    const tokenB = await tokenPara({ ...vendedorB, papel: 'VENDEDOR' });

    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'LOJA', tipo: 'FATURAMENTO' }).set('Authorization', `Bearer ${tokenB}`);

    const linhaB = res.body.ranking.find((r: { vendedorId: string }) => r.vendedorId === vendedorB.id);
    // A tem 3000, B tem 2000 — gap é 1000, mas o 3000 de A nunca aparece na resposta.
    expect(linhaB.gapParaAnterior).toBe(1000);
  });

  it('gapParaAnterior só existe na PRÓPRIA linha — achado de segurança: calculá-lo pra todo mundo permitiria reconstruir o faturamento alheio por encadeamento (valor[i-1] = valor[i] + gap[i])', async () => {
    const { vendedorB } = await fixtureComTresVendedores();
    const tokenB = await tokenPara({ ...vendedorB, papel: 'VENDEDOR' });

    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'LOJA', tipo: 'FATURAMENTO' }).set('Authorization', `Bearer ${tokenB}`);

    for (const linha of res.body.ranking) {
      if (linha.vendedorId !== vendedorB.id) {
        expect(linha.gapParaAnterior).toBeNull();
      }
    }
  });

  it('ranking não-financeiro (PA) nunca é mascarado — a regra é específica de FATURAMENTO', async () => {
    const { vendedorA, vendedorB } = await fixtureComTresVendedores();
    const tokenA = await tokenPara({ ...vendedorA, papel: 'VENDEDOR' });

    const res = await request(app).get('/gamificacao/ranking').query({ escopo: 'LOJA', tipo: 'PA' }).set('Authorization', `Bearer ${tokenA}`);

    const linhaB = res.body.ranking.find((r: { vendedorId: string }) => r.vendedorId === vendedorB.id);
    expect(Number(linhaB.valor)).toBe(3);
  });

  it('manipulação de query (escopo/tipo/periodo alternativos) não consegue contornar a máscara — nunca há um "modo" que devolva o valor bruto', async () => {
    const { vendedorA, vendedorB } = await fixtureComTresVendedores();
    const tokenA = await tokenPara({ ...vendedorA, papel: 'VENDEDOR' });

    for (const escopo of ['LOJA', 'REDE']) {
      const res = await request(app).get('/gamificacao/ranking').query({ escopo, tipo: 'FATURAMENTO', periodo: 'DIA' }).set('Authorization', `Bearer ${tokenA}`);
      const linhaB = res.body.ranking.find((r: { vendedorId: string }) => r.vendedorId === vendedorB.id);
      if (linhaB) expect(linhaB.valor).toBeNull();
    }
  });
});

// A antiga rota `POST /vendedores` (Fatia 0/1) foi removida na Fatia 9.6:
// permitia a um GERENTE criar uma conta com QUALQUER papel — inclusive
// ADMIN — com senha imediata, sem CPF e sem o fluxo de pré-autorização/
// ativação da Fatia 7.5A (escalonamento de privilégio real, nunca
// exercitado por nenhum teste). A mesma cobertura de RBAC (papel sem
// permissão / cross-tenant sempre bloqueado) já existe, mais completa, em
// `src/identidade/lifecycle.integration.test.ts` e
// `src/identidade/ativacao.integration.test.ts`, contra a rota real
// `POST /admin/vendedores` (CPF-protegida, só ADMIN).
