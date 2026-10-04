/**
 * E16 (acesso diário → uma recompensa, inclusive com acessos simultâneos),
 * E17 (reload/login repetido não paga de novo) e E18 (Admin reconhece →
 * vendedor recebe).
 */
import { expect, test } from '@playwright/test';
import { cliente, entrarPelaTela, painel, PESSOAS, token, vendedorId } from './apoio';

test.describe.configure({ mode: 'serial' });

let tkAdmin: string;

test.beforeAll(async ({ request }) => {
  tkAdmin = await token(request, PESSOAS.adminA);
  await cliente(request, tkAdmin).json('put', '/admin/engajamento/config', { ativo: true, xp: 10, moedas: 5 });
});

test('E16 — 6 acessos simultâneos no primeiro acesso do dia geram UMA recompensa', async ({ request }) => {
  const antes = await painel(request, PESSOAS.caio);
  const c = cliente(request, await token(request, PESSOAS.caio));
  const respostas = await Promise.all([1, 2, 3, 4, 5, 6].map(() => c.post('/engajamento/acesso')));
  for (const r of respostas) expect(r.status()).toBe(200);
  const depois = await painel(request, PESSOAS.caio);
  expect(depois.xp.total - antes.xp.total).toBe(10);
  expect(depois.moedas.saldo - antes.moedas.saldo).toBe(5);
});

test('E17 — login pela tela, reload e novo login no mesmo dia não pagam de novo', async ({ request, page }) => {
  const antes = await painel(request, PESSOAS.caio);
  await entrarPelaTela(page, PESSOAS.caio);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await entrarPelaTela(page, PESSOAS.caio);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  const depois = await painel(request, PESSOAS.caio);
  expect(depois.xp.total).toBe(antes.xp.total);
  expect(depois.moedas.saldo).toBe(antes.moedas.saldo);
});

test('E18 — Admin reconhece a vendedora e ela recebe no app', async ({ request, page }) => {
  const id = await vendedorId(request, tkAdmin, PESSOAS.ana.matricula);
  await cliente(request, tkAdmin).json('post', '/admin/fase1/reconhecimentos', { vendedorId: id, motivo: 'INICIATIVA', titulo: 'Vitrine impecável', mensagem: 'Montou a vitrine nova antes de abrir a loja.' });
  const d = await painel(request, PESSOAS.ana);
  expect(d.reconhecimentos.some((r: { titulo: string }) => r.titulo === 'Vitrine impecável')).toBe(true);

  await entrarPelaTela(page, PESSOAS.ana);
  await page.goto('/reconhecimentos');
  await expect(page.getByText('Vitrine impecável')).toBeVisible();
});
