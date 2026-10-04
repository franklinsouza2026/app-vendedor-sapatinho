/**
 * E1 (+E2 pela tela) — no desktop, o Admin cadastra uma vendedora com meta e
 * dias de trabalho; ela ativa a conta (CPF + código) no celular e entra já
 * vendo a Meta de Hoje = meta ÷ dias.
 */
import { expect, test } from '@playwright/test';
import { entrarPelaTela, IDS, PESSOAS } from './apoio';

test('E1 — Admin cadastra vendedora pela tela e ela ativa e entra', async ({ page, browser }) => {
  await entrarPelaTela(page, PESSOAS.adminA);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/vendedores/novo');
  await page.getByLabel('Nome completo').fill('Helena Ativação');
  await page.getByLabel(/^Matrícula no ERP/).fill('E2E-HELENA');
  await page.getByLabel(/^CPF/).fill('390.533.447-05');
  await page.getByLabel('Loja').selectOption(IDS.lojaA1);
  await page.getByLabel(/^Meta de /).fill('25000');
  await page.getByLabel(/^Dias de trabalho no mês/).fill('20');
  await page.getByRole('button', { name: 'Cadastrar e emitir acesso' }).click();
  const caixa = page.getByRole('status').filter({ hasText: 'Código de ativação' });
  await expect(caixa).toBeVisible();
  const codigo = (await caixa.locator('p.font-mono').innerText()).trim();
  expect(codigo.length).toBeGreaterThan(10);

  // a vendedora, no celular dela
  const celular = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await celular.newPage();
  await p.goto('/ativacao');
  await p.getByLabel('Loja').selectOption(IDS.lojaA1);
  await p.getByLabel('CPF').fill('390.533.447-05');
  await p.getByLabel('Código de ativação').fill(codigo);
  await p.getByLabel('Crie uma senha').fill('helena-senha-123');
  await p.getByLabel('Confirme a senha').fill('helena-senha-123');
  await p.getByRole('button', { name: 'Ativar conta' }).click();
  await expect(p).toHaveURL(/\/inicio$/);
  await expect(p.getByText(/Helena/).first()).toBeVisible();
  await expect(p.getByRole('region', { name: 'Meta de hoje' })).toContainText('R$ 1.250,00'); // 25.000 ÷ 20
  await celular.close();

  // o Admin vê a pessoa ativa na lista
  await page.goto('/admin/vendedores');
  await expect(page.getByRole('link', { name: 'Helena Ativação' }).first()).toBeVisible();
});

test('Admin desktop — telas da central abrem sem erro de console', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  await entrarPelaTela(page, PESSOAS.adminA);
  for (const rota of ['/admin', '/admin/vendedores', '/admin/lojas', '/admin/metas', '/admin/rankings', '/admin/indicadores', '/admin/campanhas', '/admin/missoes', '/admin/competicoes', '/admin/premiacoes', '/admin/xp', '/admin/vendacoins', '/admin/conquistas', '/admin/reconhecimentos', '/admin/feed', '/admin/saude', '/admin/auditoria', '/admin/prontidao', '/admin/analytics', '/admin/integracoes', '/admin/acesso-diario']) {
    await page.goto(rota);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const texto = await page.locator('main').innerText();
    expect(texto, `${rota}: texto de protótipo`).not.toMatch(/protótipo|ilustrativ|será decidid|decisão pendente|ver como vendedora|🧪/i);
  }
  expect(erros).toEqual([]);
});
