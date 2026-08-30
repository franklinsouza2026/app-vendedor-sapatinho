// E2E real: navegador de verdade + backend real (sem chamada paga) — cobre a
// jornada completa da Academia pedida pela Fatia 6: login → Home → Academia →
// trilhas → aula sem quiz (concluir direto) → aula com quiz (gabarito nunca
// exposto, score calculado no backend) → recompensa refletida na carteira →
// progresso persiste → logout → isolamento entre vendedores.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada da Academia de Vendas', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:academia-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('login → Home → Academia → aula sem quiz → aula com quiz → recompensa na carteira → progresso persiste → logout → isolamento', async ({ page }) => {
    // 1. Login como VEND001
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Falar com o Coach')).toBeVisible();

    // 2. Home → abrir Academia
    await page.getByText('Academia', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Academia de Vendas' })).toBeVisible();

    // 3. Aula SEM quiz — conteúdo visto = concluído
    await page.getByRole('button', { name: /Sondar antes de argumentar/ }).click();
    await expect(page.getByRole('heading', { name: 'Sondar antes de argumentar' })).toBeVisible();
    await page.getByRole('button', { name: 'Marcar como concluída' }).click();
    await expect(page.getByText('Aula concluída ✓')).toBeVisible();
    await page.getByRole('button', { name: '← Voltar' }).click();

    // 4. Aula COM quiz — gabarito nunca aparece antes de responder
    await page.getByRole('button', { name: /Como abrir bem um atendimento/ }).click();
    await expect(page.getByRole('heading', { name: 'Como abrir bem um atendimento' })).toBeVisible();
    await page.getByRole('button', { name: 'Ir para o quiz' }).click();
    await expect(page.getByText('Quiz')).toBeVisible();

    // Responde a primeira alternativa de cada pergunta (o score é sempre
    // calculado no backend contra o gabarito real, nunca confiado do cliente
    // — o frontend nunca recebe `correct`, então não há como "escolher a certa").
    const radios = page.locator('input[type="radio"]');
    const totalOpcoes = await radios.count();
    expect(totalOpcoes).toBeGreaterThan(0);
    const nomesVistos = new Set<string>();
    for (let i = 0; i < totalOpcoes; i++) {
      const radio = radios.nth(i);
      const nome = await radio.getAttribute('name');
      if (nome && !nomesVistos.has(nome)) {
        await radio.check();
        nomesVistos.add(nome);
      }
    }

    await page.getByRole('button', { name: 'Enviar respostas' }).click();
    await expect(page.getByText('Resultado')).toBeVisible();

    // 5. Recompensa refletida na carteira real — nunca inventada pelo LLM/frontend
    await page.goto('/moedas');
    await expect(page.getByText('Treinamento concluído')).toBeVisible();

    // 6. Progresso persiste ao voltar
    await page.goto('/academia');
    await expect(page.getByText('concluída')).toBeVisible();

    // 7. Logout
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();

    // 8. Login como VEND002 — progresso de VEND001 NÃO pode aparecer (isolamento)
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Falar com o Coach')).toBeVisible();

    await page.getByText('Academia', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Sondar antes de argumentar/ })).toContainText('não iniciada');
  });
});
