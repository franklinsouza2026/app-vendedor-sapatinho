// E2E real: navegador de verdade + backend real (MockAIProvider, sem chamada
// paga) — cobre a jornada completa do Coach pedida pela fonte de verdade
// (seção 39): login → Home → Coach → check-in → foco → mensagem → resposta
// grounded no contexto real → histórico persiste → logout → isolamento entre
// vendedores (a conversa de um nunca aparece pro outro).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada do Coach IA', () => {
  // Check-in é 1x/dia e a conversa persiste entre execuções — sem resetar,
  // uma segunda rodada no mesmo dia contra o banco de dev encontraria estado
  // de uma rodada anterior e quebraria as asserções de "primeira vez hoje".
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:coach-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('login → Home → Coach → check-in → mensagem → histórico persiste → logout → isolamento entre vendedores', async ({ page }) => {
    // 1. Login como VEND001
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Meta hoje')).toBeVisible();

    // 2. Home → Evoluir → abrir Coach
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Coach', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Coach' })).toBeVisible();

    // 3. Check-in — mood não-negativo, sem disparar o fluxo especial de NOT_GOOD
    await expect(page.getByText('Como você está chegando pra trabalhar hoje?')).toBeVisible();
    await page.getByText('Bem', { exact: true }).click();
    await expect(page.getByText('Como você está chegando pra trabalhar hoje?')).not.toBeVisible();

    // 4. Escolher foco via quick action
    await page.getByRole('button', { name: 'Organizar meu foco' }).click();
    await expect(page.getByText('Organizar meu foco', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Vamos organizar seu foco/)).toBeVisible();

    // 5. Enviar mensagem livre e validar que a resposta do MockAIProvider usa
    // o contexto profissional real (meta do dia), não um valor inventado
    await page.getByPlaceholder('Fala com o Coach...').fill('Como estou hoje?');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/pra bater sua meta de hoje/)).toBeVisible();

    // 6. Navegar pra Home e voltar — histórico da conversa continua
    await page.goto('/');
    await expect(page.getByText('Meta hoje')).toBeVisible();
    await page.goto('/coach');
    await expect(page.getByText(/Vamos organizar seu foco/)).toBeVisible();
    await expect(page.getByText(/pra bater sua meta de hoje/)).toBeVisible();

    // 7. Logout
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();

    // 8. Login como um vendedor diferente (VEND002) — a conversa de VEND001
    // NÃO pode aparecer (privacidade/isolamento de conversas, seção 22)
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible(); // landmark universal — VEND002 pode não ter meta cadastrada

    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Coach', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Coach' })).toBeVisible();
    await expect(page.getByText('Como você está chegando pra trabalhar hoje?')).toBeVisible(); // check-in ainda não feito por este vendedor hoje
    await expect(page.getByText(/Vamos organizar seu foco/)).not.toBeVisible();
    await expect(page.getByText(/pra bater sua meta de hoje/)).not.toBeVisible();
  });
});
