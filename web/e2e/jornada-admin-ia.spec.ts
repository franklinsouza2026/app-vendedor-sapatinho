// E2E real: navegador de verdade + backend real — cobre a Central de IA da
// Fatia 7.5B. NUNCA chama um provider real de verdade: credencial de OpenAI
// usada aqui é fake e nunca é testada/ativada (só "Testar conexão" do MOCK,
// que nunca sai da máquina, é exercitado de ponta a ponta).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada Admin IA — Fatia 7.5B', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:admin-ia-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Admin configura credencial (fake), testa conexão do MOCK e ajusta orçamento — sem nenhuma chamada externa real', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('ADM001');
    await page.getByLabel('Senha').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByRole('link', { name: 'IA', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Central de IA' })).toBeVisible();

    // Mock é o provider ativo por padrão (nenhuma configuração ainda).
    await expect(page.getByText('Provider ativo:')).toContainText('Mock (determinístico)');
    await expect(page.getByText('Ativo', { exact: true })).toBeVisible();

    // Configura uma credencial FAKE de OpenAI — nunca ativada nem testada
    // nesta jornada (evita qualquer chamada de rede real).
    const campoOpenAI = page.getByLabel('Chave de API — OpenAI');
    await campoOpenAI.fill('sk-fake-e2e-nao-usar-de-verdade');
    await campoOpenAI.locator('xpath=ancestor::form[1]').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Credencial configurada ✓')).toBeVisible();

    // "Testar conexão" do MOCK — chamada real, mas 100% local/determinística.
    const cardMock = page.getByRole('heading', { name: 'Mock (determinístico)' }).locator('xpath=../..');
    await cardMock.getByRole('button', { name: 'Testar conexão' }).click();
    await expect(page.getByText(/Conexão OK/)).toBeVisible();

    // Orçamento mensal — o botão "Salvar" do orçamento é sempre o primeiro
    // da página (a seção de Orçamento vem antes dos cards de provider no JSX).
    await page.getByLabel('Limite mensal (USD)').fill('15');
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect(page.getByText(/de \$15\.00/)).toBeVisible();

    // Uso — a chamada de teste do Mock já deixou pelo menos 1 registro.
    await expect(page.getByText('Uso e custo (mês atual)')).toBeVisible();
  });

  test('VENDEDOR não acessa a Central de IA nem pela URL nem pela API', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible(); // login concluído

    await page.goto('/admin/ai');
    await expect(page).toHaveURL(/\/$/); // redirecionado pra Home, nunca vê a tela

    const resposta = await page.evaluate(async () => {
      const token = localStorage.getItem('vendedor-ia:token');
      const res = await fetch('http://localhost:3010/admin/ai', { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    });
    expect(resposta).toBe(403);
  });
});
