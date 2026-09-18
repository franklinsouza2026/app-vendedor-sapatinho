// E2E real: navegador de verdade + backend real (API rodando com MockERPAdapter,
// não mock de rede) — cobre a jornada completa pedida pela fonte de verdade
// (seção 20): login → home → ranking → moedas → perfil/badges → logout.
import { expect, test } from '@playwright/test';

test.describe('Jornada do vendedor', () => {
  test('login → home → ranking → moedas → badges → perfil → logout', async ({ page }) => {
    await page.goto('/login');

    // 1. Login — usa o nome da loja (mobile-first, não o código ERP técnico) —
    // a option nativa fica "hidden" pro Playwright até o <select> abrir, então
    // confirma pelo próprio <select>, não por getByText na option.
    await expect(page.getByLabel('Loja')).toContainText('Loja Piloto');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // 2. Home — meta do dia visível com dado real vindo do backend
    // Saudação usa o PRIMEIRO NOME de quem logou (não um rótulo de papel):
    // asserção pelo comportamento, pra não quebrar se o seed mudar de nome.
    await expect(page.getByText(/Bo(m|a) (dia|tarde|noite), Marina/)).toBeVisible();
    await expect(page.getByText('Meta hoje')).toBeVisible();
    // Fatia 9.7: o rodapé passou a mostrar o frescor REAL do ERP (antes mostrava
    // a hora do fetch do navegador, o que fazia dado de 59 min parecer "agora").
    await expect(page.getByText(/Dados do ERP sincronizados às \d{2}:\d{2}|Ainda sem sincronização do ERP hoje/)).toBeVisible();

    // 3. Ranking
    await page.getByRole('link', { name: 'Ranking', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    await expect(page.getByText('Marina Silva')).toBeVisible();

    // 4. Moedas (acesso via Perfil, conforme navegação reduzida da fatia)
    await page.getByRole('link', { name: 'Perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Marina Silva' })).toBeVisible();
    await page.getByText('moedas').click();
    await expect(page.getByRole('heading', { name: 'Minhas Moedas' })).toBeVisible();
    await expect(page.getByText('Saldo atual')).toBeVisible();

    // 5. Badges/Conquistas
    await page.goBack();
    await page.getByText('conquistas').click();
    await expect(page.getByRole('heading', { name: 'Conquistas' })).toBeVisible();

    // 6. Logout — e confirma que a rota protegida não é mais acessível
    await page.goBack();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();

    await page.goto('/moedas');
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible(); // redirecionado pro login, não vazou dado
  });

  test('não deixa acessar rota protegida sem login (digitando a URL direto)', async ({ page }) => {
    await page.goto('/ranking');
    await expect(page).toHaveURL(/\/login$/);
  });
});
