// E2E real: navegador de verdade + backend real (MockAIProvider, sem chamada
// paga) — cobre a jornada completa do Simulador pedida pela Fatia 6: login →
// Home → Simulador → escolher cenário/dificuldade → indicador de simulação →
// chat com a cliente simulada → encerrar → avaliação estruturada → histórico
// persiste → logout → isolamento entre vendedores.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada do Simulador de Atendimento', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:simulador-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('login → Home → Simulador → cenário/dificuldade → chat → encerrar → avaliação → histórico persiste → logout → isolamento', async ({ page }) => {
    // 1. Login como VEND001
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Falar com o Coach')).toBeVisible();

    // 2. Home → abrir Simulador
    await page.getByText('Simulador', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Simulador de Atendimento' })).toBeVisible();

    // 3. Escolher cenário e dificuldade — persona/roteiro sempre determinísticos (nunca inventados pelo LLM)
    await page.getByRole('button', { name: /Cliente "só olhando"/ }).click();
    await expect(page.getByText('Escolha a dificuldade')).toBeVisible();
    await page.getByRole('button', { name: 'Fácil' }).click();

    // 4. Indicador claro de que é simulação, nunca confundível com um cliente real
    await expect(page.getByText('Simulação — cliente fictícia')).toBeVisible();
    await expect(page.getByText('turno 0/8')).toBeVisible();

    // 5. Vendedor responde — turno avança e a cliente reage
    await page.getByPlaceholder('Responda à cliente...').fill('Claro! Fico à disposição se precisar de alguma coisa.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('turno 1/8')).toBeVisible();

    // 6. Encerrar manualmente antes do limite de turnos
    await page.getByRole('button', { name: 'Encerrar simulação' }).click();
    await expect(page.getByText('Sua avaliação')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Treinar novamente' })).toBeVisible();

    // 7. Voltar e conferir o histórico — a sessão concluída persiste
    await page.getByRole('button', { name: 'Treinar novamente' }).click();
    await page.getByRole('button', { name: 'Ver histórico de simulações' }).click();
    await expect(page.getByRole('heading', { name: 'Histórico de simulações' })).toBeVisible();
    await expect(page.getByText('Cliente "só olhando"')).toBeVisible();

    // 8. Logout
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();

    // 9. Login como VEND002 — histórico de VEND001 NÃO pode aparecer (IDOR/tenant safety)
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Falar com o Coach')).toBeVisible();

    await page.getByText('Simulador', { exact: true }).click();
    await page.getByRole('button', { name: 'Ver histórico de simulações' }).click();
    await expect(page.getByText('Você ainda não concluiu nenhuma simulação.')).toBeVisible();
  });
});
