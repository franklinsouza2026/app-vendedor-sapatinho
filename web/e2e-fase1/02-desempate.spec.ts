/**
 * E5, E6, E7 — desempate D9 no ranking mensal por vendas:
 * faturamento → acessos ao app no mês → ticket médio; empate nos três fica empatado.
 * Loja A3 tem só a Duda e a Eva.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { cancelamento, cliente, entregar, IDS, painel, PESSOAS, sincronizar, token, venda } from './apoio';

test.describe.configure({ mode: 'serial' });

let tkAdmin: string;

async function acessar(request: APIRequestContext, p: (typeof PESSOAS)['e1'], vezes: number) {
  const c = cliente(request, await token(request, p));
  for (let i = 0; i < vezes; i++) await c.json('post', '/engajamento/acesso');
}

async function posicoes(request: APIRequestContext) {
  const d = await painel(request, PESSOAS.e1);
  const linhas = d.rankings.loja.VENDAS as { pessoaId: string; posicao: number; empatado: boolean }[];
  const nomeDe = (id: string) => d.pessoas.find((p: { id: string; nome: string }) => p.id === id)?.nome as string;
  return Object.fromEntries(linhas.map((l) => [nomeDe(l.pessoaId).split(' ')[0], { posicao: l.posicao, empatado: l.empatado }]));
}

test.beforeAll(async ({ request }) => {
  tkAdmin = await token(request, PESSOAS.adminA);
});

test('E7 — empate em faturamento, acessos e ticket: o empate permanece (as duas em 1º)', async ({ request }) => {
  entregar(IDS.integracaoA, [venda(PESSOAS.e1, 1000, { id: 'emp-duda-1' }), venda(PESSOAS.e2, 1000, { id: 'emp-eva-1' })]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  await acessar(request, PESSOAS.e1, 1);
  await acessar(request, PESSOAS.e2, 1);
  const p = await posicoes(request);
  expect(p.Duda).toEqual({ posicao: 1, empatado: true });
  expect(p.Eva).toEqual({ posicao: 1, empatado: true });
});

test('E5 — empate de faturamento: quem acessou mais o app no mês fica na frente', async ({ request }) => {
  await acessar(request, PESSOAS.e1, 2); // Duda 3 × Eva 1
  const p = await posicoes(request);
  expect(p.Duda.posicao).toBe(1);
  expect(p.Eva.posicao).toBe(2);
  expect(p.Duda.empatado).toBe(false);
});

test('E6 — empate de faturamento e acessos: maior ticket médio fica na frente', async ({ request }) => {
  await acessar(request, PESSOAS.e2, 2); // 3 × 3
  // Duda troca 1 × R$ 1.000 por 2 × R$ 500: mesmo faturamento, ticket menor
  entregar(IDS.integracaoA, [cancelamento('emp-duda-1', 'emp-duda-1-cancel'), venda(PESSOAS.e1, 500), venda(PESSOAS.e1, 500)]);
  await sincronizar(request, tkAdmin, IDS.integracaoA);
  const p = await posicoes(request);
  expect(p.Eva.posicao).toBe(1);
  expect(p.Duda.posicao).toBe(2);
});
