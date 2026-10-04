// Ingestão do contrato do ERP (D1/D4): fatos idempotentes, cancelamento,
// devolução, fuso da empresa, vínculo de loja/vendedor e concorrência.
import { describe, expect, it } from 'vitest';
import { prisma } from '../../db';
import { realizadoNoPeriodo } from '../../services/metas.service';
import { fimDoDiaLocal, instanteDoDia } from '../../tempo/dia';
import { cancelamento, criarCenarioFase1, devolucao, emLocal, item, venda } from '../test-helpers';
import { ingerirEventos } from './ingestao.service';

const TZ = 'America/Sao_Paulo';
const DIA = '2026-10-14';

async function realizadoDoDia(vendedorId: string, dia = DIA) {
  return realizadoNoPeriodo(vendedorId, instanteDoDia(dia, TZ), fimDoDiaLocal(dia, TZ), TZ);
}

describe('Ingestão de vendas — fatos e agregado do dia', () => {
  it('venda entra pelo contrato e vira faturamento, vendas, peças e pares do dia', async () => {
    const c = await criarCenarioFase1();
    const r = await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(200, { quantidade: 2, pares: 2 }), item(100, { referencia: 'BOLSA', categoria: 'Bolsa', pares: 0 })])] });
    expect(r.vendasNovas).toBe(1);
    const agregado = await prisma.indicadorRealizado.findFirstOrThrow({ where: { vendedorId: c.vendedor.id } });
    expect(Number(agregado.faturamento)).toBe(300);
    expect(agregado.numAtendimentos).toBe(1);
    expect(agregado.pecas).toBe(3);
    expect(agregado.pares).toBe(2);
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(300);
  });

  it('o MESMO evento entregue de novo (sync repetido) não duplica nada', async () => {
    const c = await criarCenarioFase1();
    const e = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '11:00'), [item(150)]);
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [e] });
    const r2 = await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [e, e] });
    expect(r2.vendasNovas).toBe(0);
    expect(r2.duplicados).toBe(2);
    expect(await prisma.venda.count({ where: { vendedorId: c.vendedor.id } })).toBe(1);
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(150);
  });

  it('5 ingestões concorrentes da mesma venda: exatamente 1 venda gravada', async () => {
    const c = await criarCenarioFase1();
    const e = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '12:00'), [item(99)]);
    await Promise.all(Array.from({ length: 5 }, () => ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [e] })));
    expect(await prisma.venda.count({ where: { vendedorId: c.vendedor.id } })).toBe(1);
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(99);
  });

  it('cancelamento zera a venda do dia; cancelamento repetido não desconta de novo', async () => {
    const c = await criarCenarioFase1();
    const v1 = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(300)]);
    const v2 = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '15:00'), [item(100)]);
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [v1, v2] });
    const canc = cancelamento(v1.idExterno, emLocal(DIA, '16:00'));
    const r = await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [canc] });
    expect(r.ajustesNovos).toBe(1);
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(100);

    const r2 = await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [canc, cancelamento(v1.idExterno, emLocal(DIA, '17:00'))] });
    expect(r2.ajustesNovos).toBe(0);
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(100);
    // Histórico preservado: a venda continua existindo, só que CANCELADA.
    const original = await prisma.venda.findFirstOrThrow({ where: { idExterno: v1.idExterno } });
    expect(original.status).toBe('CANCELADA');
  });

  it('venda e cancelamento no mesmo lote: o cancelamento nunca se perde pela ordem', async () => {
    const c = await criarCenarioFase1();
    const v = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(500)]);
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [cancelamento(v.idExterno, emLocal(DIA, '10:30')), v] });
    expect((await realizadoDoDia(c.vendedor.id)).faturamento).toBe(0);
  });

  it('devolução parcial desconta só o item devolvido (valor, peças e pares); repetida não desconta de novo', async () => {
    const c = await criarCenarioFase1();
    const v = venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(200, { referencia: 'SAP-1', quantidade: 2, pares: 2 }), item(80, { referencia: 'MEIA', pares: 0 })]);
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [v] });
    const dev = devolucao(v.idExterno, emLocal('2026-10-16', '11:00'), [item(100, { referencia: 'SAP-1', quantidade: 1, pares: 1 })]);
    await ingerirEventos({ empresaId: c.empresa.id, integracaoId: c.integracao.id, eventos: [dev, dev] });
    const agregado = await prisma.indicadorRealizado.findFirstOrThrow({ where: { vendedorId: c.vendedor.id } });
    expect(Number(agregado.faturamento)).toBe(180);
    expect(agregado.pecas).toBe(2);
    expect(agregado.pares).toBe(1);
    expect(await prisma.vendaAjuste.count({ where: { vendaId: (await prisma.venda.findFirstOrThrow({ where: { idExterno: v.idExterno } })).id } })).toBe(1);
  });

  it('fuso da empresa: 23:30 local é hoje; 00:10 local é amanhã (servidor em qualquer fuso)', async () => {
    const c = await criarCenarioFase1();
    await ingerirEventos({
      empresaId: c.empresa.id,
      integracaoId: c.integracao.id,
      eventos: [venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(DIA, '23:30'), [item(70)]), venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal('2026-10-15', '00:10'), [item(30)])],
    });
    const dias = await prisma.venda.findMany({ where: { vendedorId: c.vendedor.id }, orderBy: { ocorridoEm: 'asc' } });
    expect(dias.map((d) => d.dia.toISOString().slice(0, 10))).toEqual([DIA, '2026-10-15']);
    expect((await realizadoDoDia(c.vendedor.id, DIA)).faturamento).toBe(70);
    expect((await realizadoDoDia(c.vendedor.id, '2026-10-15')).faturamento).toBe(30);
  });

  it('evento fora do contrato, loja sem vínculo e vendedor desconhecido são ignorados e contados — nunca inventados', async () => {
    const c = await criarCenarioFase1();
    const r = await ingerirEventos({
      empresaId: c.empresa.id,
      integracaoId: c.integracao.id,
      eventos: [{ tipo: 'VENDA', valor: 'muito' }, venda('LOJA-INEXISTENTE', c.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(10)]), venda(c.loja.codigoErp, 'NINGUEM', emLocal(DIA, '10:00'), [item(10)]), cancelamento('VENDA-QUE-NAO-EXISTE', emLocal(DIA, '10:00'))],
    });
    expect(r.vendasNovas).toBe(0);
    expect(r.motivosIgnorados).toEqual({ EVENTO_INVALIDO: 1, LOJA_NAO_VINCULADA: 1, VENDEDOR_NAO_VINCULADO: 1, VENDA_DESCONHECIDA: 1 });
  });

  it('empresa A nunca grava venda numa loja da empresa B, mesmo com o código da loja de B', async () => {
    const a = await criarCenarioFase1();
    const b = await criarCenarioFase1();
    const r = await ingerirEventos({ empresaId: a.empresa.id, integracaoId: a.integracao.id, eventos: [venda(b.loja.codigoErp, b.vendedor.matriculaErp, emLocal(DIA, '10:00'), [item(10)])] });
    expect(r.vendasNovas).toBe(0);
    expect(await prisma.venda.count({ where: { vendedorId: b.vendedor.id } })).toBe(0);
  });
});
