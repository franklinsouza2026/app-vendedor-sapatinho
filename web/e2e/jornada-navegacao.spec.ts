// E2E real: navegador de verdade + backend real — valida a arquitetura de
// navegação inteira da Fatia 6.5 (bottom nav de 5 itens: Início, Performance,
// Evoluir, Ranking, Perfil), incluindo o hub /evoluir e ida-e-volta pros 4
// módulos, sem depender de nenhum specialist responder de verdade.
import { expect, test } from '@playwright/test';

test.describe('Navegação completa pós-redesign (Fatia 6.5)', () => {
  test('login → Home → Performance → Evoluir → Coach → voltar → Treinador → voltar → Simulador → voltar → Academia → Ranking → Perfil → logout', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Home
    await expect(page.getByText('Meta hoje')).toBeVisible();

    // Performance (bottom nav)
    await page.getByRole('link', { name: 'Performance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();

    // Evoluir (hub)
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Evoluir' })).toBeVisible();

    // Coach → voltar pro hub
    await page.getByText('Coach', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Coach' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Evoluir' })).toBeVisible();

    // Treinador → voltar pro hub
    await page.getByText('Treinador', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Treinador de Vendas' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Evoluir' })).toBeVisible();

    // Simulador → voltar pro hub
    await page.getByText('Simulador', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Simulador de Atendimento' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Evoluir' })).toBeVisible();

    // Academia (fica dentro do Layout — bottom nav continua visível)
    await page.getByText('Academia', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Academia de Vendas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();

    // Ranking
    await page.getByRole('link', { name: 'Ranking', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();

    // Perfil → logout
    await page.getByRole('link', { name: 'Perfil', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();
  });
});
