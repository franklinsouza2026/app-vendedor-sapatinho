// E2E real: navegador de verdade + backend real (MockAIProvider, sem chamada
// paga) — cobre a jornada completa do Treinador pedida pela Fatia 5 (seção
// 41): login → Home → Treinador → objeção → resposta baseada no playbook →
// pergunta sobre PA → contexto profissional → histórico persiste → logout →
// isolamento entre vendedores.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Jornada do Treinador de Vendas', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:treinador-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('login → Home → Treinador → objeção → PA → histórico persiste → logout → isolamento entre vendedores', async ({ page }) => {
    // 1. Login como VEND001
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Meta hoje')).toBeVisible();

    // 2. Home → Evoluir → abrir Treinador
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Treinador', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Treinador de Vendas' })).toBeVisible();

    // 3. Selecionar objeção "Está caro" — resposta deve citar a objeção real
    // e uma seção real do playbook (oficial ou demonstrativa, nunca inventada)
    await page.getByRole('button', { name: 'Está caro', exact: true }).click();
    await expect(page.getByText(/a cliente disse "Está caro"/)).toBeVisible();

    // 4. Pergunta livre sobre PA (quick actions somem após a 1ª mensagem,
    // como no Coach) — resposta usa o contexto profissional real (PA do
    // vendedor), não um número inventado
    await page.getByPlaceholder('Descreva a situação...').fill('Quero melhorar meu PA');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/Seu PA hoje está em/)).toBeVisible();

    // 5. Navegar pra Home e voltar — histórico da conversa continua
    await page.goto('/');
    await expect(page.getByText('Meta hoje')).toBeVisible();
    await page.goto('/treinador');
    await expect(page.getByText(/a cliente disse "Está caro"/)).toBeVisible();
    await expect(page.getByText(/Seu PA hoje está em/)).toBeVisible();

    // 6. Logout
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();

    // 7. Login como um vendedor diferente (VEND002) — a conversa de VEND001
    // NÃO pode aparecer (privacidade/isolamento de conversas, seção 16)
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible(); // landmark universal — VEND002 pode não ter meta cadastrada

    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Treinador', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Treinador de Vendas' })).toBeVisible();
    await expect(page.getByText('A cliente disse...')).toBeVisible(); // sem histórico -> mostra objeções/quick actions
    await expect(page.getByText(/a cliente disse "Está caro"/)).not.toBeVisible();
    await expect(page.getByText(/Seu PA hoje está em/)).not.toBeVisible();
  });
});
