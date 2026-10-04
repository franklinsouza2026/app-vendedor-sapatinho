/**
 * E8, E9, E10 (missões / Produto da Semana), E11 (campanha) e E12
 * (competição) — tudo configurado pela API do Admin e movido por vendas que
 * entram pelo adapter.
 */
import { expect, test } from '@playwright/test';
import { cancelamento, cliente, entregar, IDS, painel, PESSOAS, sincronizar, token, venda } from './apoio';

test.describe.configure({ mode: 'serial' });

let tkAdmin: string;
const ids = { missao: '', competicao: '', campanha: '', scarpin2: '' };
const scarpin = (valor = 100) => [{ referencia: 'E2E-SCARPIN', descricao: 'Scarpin E2E', categoria: 'Salto', quantidade: 1, pares: 1, valor }];
const emDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

test.beforeAll(async ({ request }) => {
  tkAdmin = await token(request, PESSOAS.adminA);
});

test('E8 + E10 — Produto da Semana: só a venda do produto escolhido faz a missão progredir', async ({ request }) => {
  const admin = cliente(request, tkAdmin);
  await admin.json('post', '/admin/fase1/produtos', { referencia: 'E2E-SCARPIN', nome: 'Scarpin E2E', categoria: 'Salto', preco: 100 });
  const missao = await admin.json('post', '/admin/fase1/missoes', {
    nome: 'Scarpin da semana', tipo: 'PRODUTO_SEMANA', template: 'PRODUTO_SEMANA', descricao: 'Venda 2 pares do Scarpin E2E', unidade: 'par', alvo: 2, xp: 40, moedas: 15, premioId: null,
    lojas: [IDS.lojaA1], inicio: emDias(-1 / 24), fim: emDias(3), produtos: ['E2E-SCARPIN'], regras: 'Conta par vendido da referência.', parametros: {},
  });
  ids.missao = missao.id;
  expect((await admin.json('post', `/admin/fase1/missoes/${missao.id}/publicar`)).status).toBe('ATIVA');

  entregar(IDS.integracaoA, [venda(PESSOAS.bia, 100, { itens: scarpin() }), venda(PESSOAS.bia, 50)]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const m = (await painel(request, PESSOAS.bia)).missoes.find((x: { id: string }) => x.id === ids.missao);
  expect(m.progresso).toBe(1);
  expect(m.alvo).toBe(2);
  // missão só da loja A1: o Caio (A2) não participa
  expect((await painel(request, PESSOAS.caio)).missoes.some((x: { id: string }) => x.id === ids.missao)).toBe(false);
});

test('E9 — missão concluída paga a recompensa uma única vez (reentrega e novo sync não pagam de novo)', async ({ request }) => {
  const antes = await painel(request, PESSOAS.bia);
  const v = venda(PESSOAS.bia, 100, { itens: scarpin() });
  ids.scarpin2 = v.idExterno;
  entregar(IDS.integracaoA, [v]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const depois = await painel(request, PESSOAS.bia);
  const m = depois.missoes.find((x: { id: string }) => x.id === ids.missao);
  expect(m.progresso).toBe(2);
  expect(m.concluidaEm).toBeTruthy();
  expect(depois.xp.total - antes.xp.total).toBe(40);
  expect(depois.moedas.saldo - antes.moedas.saldo).toBe(15);
});

test('D4 — cancelar a venda que concluiu a missão desfaz a conclusão e estorna (compensando)', async ({ request }) => {
  const antes = await painel(request, PESSOAS.bia);
  entregar(IDS.integracaoA, [cancelamento(ids.scarpin2)]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const depois = await painel(request, PESSOAS.bia);
  const m = depois.missoes.find((x: { id: string }) => x.id === ids.missao);
  expect(m.progresso).toBe(1);
  expect(m.concluidaEm ?? null).toBeNull();
  expect(antes.xp.total - depois.xp.total).toBe(40);
});

test('E11 + E12 — competição e campanha: iniciam, progridem com vendas, encerram com resultado congelado e histórico', async ({ request }) => {
  const admin = cliente(request, tkAdmin);
  const premioComp = await admin.json('post', '/admin/fase1/premios', { nome: 'Troféu Sprint', tipo: 'DIGITAL', xp: 77, moedas: 0, comBadge: false, categoria: null, descricao: '' });
  const premioCamp = await admin.json('post', '/admin/fase1/premios', { nome: 'Bônus Campanha', tipo: 'DIGITAL', xp: 33, moedas: 0, comBadge: false, categoria: null, descricao: '' });

  const comp = await admin.json('post', '/admin/fase1/competicoes', {
    nome: 'Sprint de vendas', tipo: 'VENDEDOR', formato: 'ESPECIAL', metrica: 'QTD_VENDAS', categoria: null, escopo: 'TODAS', lojas: 'TODAS', regra: 'Quem fizer mais vendas.', inicio: emDias(-1 / 24), fim: emDias(2), premioIds: [premioComp.id],
  });
  ids.competicao = comp.id;
  const entradaCampanha = { nome: 'Outubro E2E', descricao: 'Campanha de teste', objetivo: 'Girar vendas', inicio: emDias(-1 / 24), fim: emDias(2), lojas: 'TODAS', regras: 'Vale a classificação da Sprint.', frentes: [{ id: 'fr-1', icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', refId: comp.id, premioId: premioCamp.id }] };
  const validacao = await admin.json('post', '/admin/fase1/campanhas/validar', entradaCampanha);
  expect(validacao.itens.filter((i: { ok: boolean }) => !i.ok)).toEqual([]);
  const camp = await admin.json('post', '/admin/fase1/campanhas', entradaCampanha);
  ids.campanha = camp.id;
  expect((await admin.json('post', `/admin/fase1/campanhas/${camp.id}/publicar`)).status).toBe('ATIVA');

  // Caio dispara: 4 vendas hoje
  entregar(IDS.integracaoA, [1, 2, 3, 4].map(() => venda(PESSOAS.caio, 120)));
  await sincronizar(request, tkAdmin, IDS.integracaoA);

  const dCaio = await painel(request, PESSOAS.caio);
  const c = dCaio.competicoes.find((x: { id: string }) => x.id === comp.id);
  expect(c.status).toBe('ATIVA');
  expect(c.participantes[0].id).toBe(c.meuId);
  expect(dCaio.campanhas.find((x: { id: string }) => x.id === camp.id).status).toBe('ATIVA');

  // encerra a campanha: resultado congelado aparece no histórico do vendedor
  const xpAntes = dCaio.xp.total;
  await admin.json('post', `/admin/fase1/campanhas/${camp.id}/encerrar`);
  let d = await painel(request, PESSOAS.caio);
  const encerrada = d.campanhas.find((x: { id: string }) => x.id === camp.id);
  expect(encerrada.status).toBe('ENCERRADA');
  expect(encerrada.resultado[0].vencedor).toContain('Caio');
  expect(d.xp.total - xpAntes).toBe(33);

  // encerra a competição: 1º lugar recebe o prêmio uma vez; repetir é recusado
  await admin.json('post', `/admin/fase1/competicoes/${comp.id}/encerrar`);
  expect((await admin.post(`/admin/fase1/competicoes/${comp.id}/encerrar`)).status()).toBe(409);
  d = await painel(request, PESSOAS.caio);
  expect(d.xp.total - xpAntes).toBe(33 + 77);
  expect(d.competicoes.find((x: { id: string }) => x.id === comp.id)?.status ?? 'ENCERRADA').toBe('ENCERRADA');

  // venda depois do encerramento não muda o resultado congelado
  entregar(IDS.integracaoA, [1, 2, 3, 4, 5, 6].map(() => venda(PESSOAS.ana, 50)));
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const estado = await admin.json('get', '/admin/fase1/estado');
  const congelada = estado.competicoes.find((x: { id: string }) => x.id === comp.id);
  expect(congelada.status).toBe('ENCERRADA');
  expect(congelada.classificacao[0].nome).toContain('Caio');
  const campEstado = estado.campanhas.find((x: { id: string }) => x.id === camp.id);
  expect(campEstado.resultado[0].vencedor).toContain('Caio');
});
