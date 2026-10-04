/**
 * E2, E3, E4, E13, E14, E15, E19 — venda entra pelo adapter (arquivo do
 * contrato → sync do worker → ingestão) e tudo reage: meta, ranking, XP,
 * VendaCoins, cancelamento e recorde. Nada é inserido direto no banco.
 */
import { expect, test } from '@playwright/test';
import { cancelamento, cliente, entregar, entrarPelaTela, IDS, mesAtual, painel, PESSOAS, sincronizar, token, venda, vendedorId } from './apoio';

test.describe.configure({ mode: 'serial' });

let tkAdmin: string;
const vendaAna = { meta: '', grande: '' };

test.beforeAll(async ({ request }) => {
  tkAdmin = await token(request, PESSOAS.adminA);
});

test('E2 — meta mensal + dias previstos viram a Meta de Hoje (mensal ÷ dias), na tela', async ({ request, page }) => {
  const admin = cliente(request, tkAdmin);
  for (const p of [PESSOAS.ana, PESSOAS.bia]) {
    const id = await vendedorId(request, tkAdmin, p.matricula);
    await admin.json('put', `/admin/fase1/metas/${mesAtual()}/vendedores/${id}`, { mensal: 30000, diasPrevistos: 24 });
  }
  const d = await painel(request, PESSOAS.ana);
  expect(d.hoje.meta).toBe(1250);
  expect(d.mes.meta).toBe(30000);

  await entrarPelaTela(page, PESSOAS.ana);
  const meta = page.getByRole('region', { name: 'Meta de hoje' });
  await expect(meta).toContainText('R$ 1.250,00');
});

test('E3 — venda entregue pelo adapter atualiza a performance', async ({ request }) => {
  const v = venda(PESSOAS.ana, 400);
  entregar(IDS.integracaoA, [v]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const d = await painel(request, PESSOAS.ana);
  expect(d.hoje.realizado.faturamento).toBe(400);
  expect(d.hoje.realizado.vendas).toBe(1);
  expect(d.mes.realizado.faturamento).toBe(400);
});

test('E4 — venda move o ranking mensal (e a colega não vê o R$ da outra)', async ({ request }) => {
  entregar(IDS.integracaoA, [venda(PESSOAS.bia, 700)]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const d = await painel(request, PESSOAS.ana);
  const linhas = d.rankings.loja.VENDAS as { pessoaId: string; posicao: number; valor: number | null }[];
  const eu = linhas.find((l) => l.pessoaId === d.vendedor.id)!;
  const outra = linhas.find((l) => l.pessoaId !== d.vendedor.id)!;
  expect(outra.posicao).toBe(1);
  expect(eu.posicao).toBe(2);
  expect(outra.valor).toBeNull();
  expect(eu.valor).toBe(400);
});

test('E13 — bater a meta do dia credita XP e VendaCoins da régua, uma vez', async ({ request }) => {
  const regua = (await cliente(request, tkAdmin).json('get', '/admin/fase1/estado')).gamificacao.regua;
  const antes = await painel(request, PESSOAS.ana);
  const v = venda(PESSOAS.ana, 900); // 400 + 900 = 1.300 ≥ 1.250
  vendaAna.meta = v.idExterno;
  entregar(IDS.integracaoA, [v]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  await sincronizar(request, tkAdmin, IDS.integracaoA); // reentrega: idempotente
  const depois = await painel(request, PESSOAS.ana);
  expect(depois.xp.total - antes.xp.total).toBe(regua.xp.META_DIARIA_100);
  expect(depois.moedas.saldo - antes.moedas.saldo).toBe(regua.moedas.META_DIARIA_100);
});

test('E14 — cancelamento corrige realizado, ranking e estorna a recompensa da meta', async ({ request }) => {
  const antes = await painel(request, PESSOAS.ana);
  entregar(IDS.integracaoA, [cancelamento(vendaAna.meta, 'cancel-e14')]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const depois = await painel(request, PESSOAS.ana);
  expect(depois.hoje.realizado.faturamento).toBe(400);
  expect(depois.hoje.realizado.vendas).toBe(1);
  expect(antes.xp.total - depois.xp.total).toBeGreaterThan(0);
  const regua = (await cliente(request, tkAdmin).json('get', '/admin/fase1/estado')).gamificacao.regua;
  expect(antes.xp.total - depois.xp.total).toBe(regua.xp.META_DIARIA_100);
  // histórico preservado: o estorno é um lançamento novo, nada é apagado
  expect(depois.moedas.historico.some((m: { valor: number }) => m.valor < 0)).toBeTruthy();
});

test('E15 — cancelamento repetido (mesmo id e outro id para a mesma venda) não estorna de novo', async ({ request }) => {
  const antes = await painel(request, PESSOAS.ana);
  entregar(IDS.integracaoA, [cancelamento(vendaAna.meta, 'cancel-e14'), cancelamento(vendaAna.meta, 'cancel-e15-outro-id')]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const depois = await painel(request, PESSOAS.ana);
  expect(depois.xp.total).toBe(antes.xp.total);
  expect(depois.moedas.saldo).toBe(antes.moedas.saldo);
  expect(depois.hoje.realizado.faturamento).toBe(400);
});

test('E19 — recorde de melhor dia detectado no dia certo; cancelar a venda do recorde o revoga', async ({ request }) => {
  // histórico do Caio (preparo): anteontem R$ 300, ontem R$ 500
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  let d = await painel(request, PESSOAS.caio);
  const melhorDia = d.recordes.find((r: { tipo: string }) => r.tipo === 'MELHOR_DIA');
  expect(melhorDia.valor).toBe(500);
  const recordeNoFeed = () => d.feed.filter((e: { tipo: string; meu?: boolean }) => e.tipo === 'RECORDE');
  expect(recordeNoFeed().length).toBe(1);

  entregar(IDS.integracaoA, [cancelamento('hist-caio-2', 'cancel-hist-caio-2')]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  d = await painel(request, PESSOAS.caio);
  expect(d.recordes.find((r: { tipo: string }) => r.tipo === 'MELHOR_DIA').valor).toBe(300);
  expect(recordeNoFeed().length).toBe(0);
});

