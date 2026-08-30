// E2E real: navegador de verdade + backend real (sem chamada paga) — cobre a
// jornada completa de Missões pedida pela Fatia 7: login → Home → ver missão
// → abrir missão → usar CTA recomendado → executar a ação elegível → backend
// reconhece a evidência real → missão conclui → feedback visual → refresh →
// missão continua concluída → nenhuma recompensa duplicada.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada de Missões', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:missoes-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('login → Home → missão de hoje → CTA → concluir aula → missão concluída → sem duplicar ao atualizar', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // 1. Home mostra o bloco "Missões de hoje" com a missão de Academia
    await expect(page.getByText('Missões de hoje')).toBeVisible();
    const cardMissao = page.getByText('Conclua uma aula da Academia');
    await expect(cardMissao).toBeVisible();

    // 2. Abrir a tela dedicada de Missões e conferir status/progresso inicial
    await page.getByRole('link', { name: 'ver todas' }).click();
    await expect(page.getByRole('heading', { name: 'Missões' })).toBeVisible();
    await expect(page.getByText('0%').first()).toBeVisible();

    // 3. Usar o CTA da missão — leva pra Academia (actionType=ACADEMY)
    const missaoCard = page
      .locator('div')
      .filter({ hasText: 'Conclua uma aula da Academia' })
      .filter({ has: page.getByRole('link', { name: 'Treinar agora' }) })
      .last();
    await missaoCard.getByRole('link', { name: 'Treinar agora' }).click();
    await expect(page.getByRole('heading', { name: 'Academia de Vendas' })).toBeVisible();

    // 4. Concluir uma aula real (sem quiz) — evidência real que a missão observa
    await page.getByRole('button', { name: /Sondar antes de argumentar/ }).click();
    await page.getByRole('button', { name: 'Marcar como concluída' }).click();
    await expect(page.getByText('Aula concluída ✓')).toBeVisible();

    // 5. Voltar pras Missões — o backend já reconheceu a evidência (sem POST nenhum)
    await page.goto('/missoes');
    await expect(page.getByText('Concluída ✓')).toBeVisible();

    // 6. Recompensa refletida na carteira real (evento base TREINAMENTO_CONCLUIDO)
    await page.goto('/moedas');
    await expect(page.getByText('Treinamento concluído')).toHaveCount(1);

    // 7. Atualizar não duplica nada — recarrega a página e revalida a mesma missão
    await page.goto('/missoes');
    await expect(page.getByText('Concluída ✓')).toBeVisible();
    await page.goto('/moedas');
    await expect(page.getByText('Treinamento concluído')).toHaveCount(1);
  });
});
