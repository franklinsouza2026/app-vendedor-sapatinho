// E2E real: navegador de verdade + backend real — cobre a visão do Manager
// na Universidade (Fatia 7.5E, seção 61/67/95): Equipe → Vendedor →
// Desenvolvimento, registra uma avaliação (vira evidência real), e prova
// que o escopo por loja é respeitado (nunca cross-store).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3010';
import { MATRICULAS_E2E, SENHA_E2E, garantirLojaAuxiliarE2E, garantirPessoaE2E } from './fixtures';

const prisma = new PrismaClient();

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Marco pós-login agnóstico de papel (Fatia 9.7): o ADMIN aterrissa no shell
  // administrativo, que não tem a bottom nav do vendedor — esperar por "Perfil"
  // só funcionava pra VENDEDOR/GERENTE.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('Jornada Universidade — Manager', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:universidade-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Manager vê a equipe da própria loja, avalia um vendedor (vira evidência) e nunca acessa vendedor de outra loja', async ({ page }) => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: vend001.lojaId } });

    // Fixtures de identidade ESTÁVEL (Fatia 9.7) — antes cada execução criava
    // um gerente, uma loja e um vendedor novos, sem nunca remover.
    const matricula = MATRICULAS_E2E.gerenteUniversidade;
    await garantirPessoaE2E(prisma, {
      matriculaErp: matricula,
      nome: 'Gerente E2E',
      empresaId: loja.empresaId,
      lojaId: loja.id,
      papel: 'GERENTE',
    });

    const outraLoja = await garantirLojaAuxiliarE2E(prisma, loja.empresaId);
    const vendedorDeOutraLoja = await garantirPessoaE2E(prisma, {
      matriculaErp: MATRICULAS_E2E.vendedorOutraLoja,
      nome: 'Vendedor de Outra Loja',
      empresaId: loja.empresaId,
      lojaId: outraLoja.id,
    });
    // Competência é catálogo global e não polui a visão de estrutura/ranking —
    // segue com id único por execução, mas com `code` marcado como E2E.
    const competencia = await prisma.competency.create({ data: { code: `e2e-mgr-${randomUUID()}`, name: 'Comunicação (E2E)', description: 'd' } });

    await login(page, matricula, SENHA_E2E);

    // 1. Vai pro Perfil, vê o link "Minha Equipe" (só GERENTE vê isso).
    await page.goto('/perfil');
    await page.getByRole('link', { name: 'Minha Equipe' }).click();
    await expect(page.getByRole('heading', { name: 'Minha Equipe' })).toBeVisible();

    // 2. Vê VEND001 (própria loja), abre o desenvolvimento dele.
    await expect(page.getByText(vend001.nome, { exact: true })).toBeVisible();
    await page.getByText(vend001.nome, { exact: true }).click();
    await expect(page.getByRole('heading', { name: vend001.nome })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Comunicação (E2E)' })).toHaveCount(1);

    // 3. Registra uma avaliação (1-5) — vira evidência real automaticamente.
    // Escopado ao formulário de avaliação (a tela também tem o formulário de
    // Reconhecimento da Fatia 8, com seu próprio combobox de tipo).
    await page.locator('form').filter({ hasText: 'Registrar avaliação' }).getByRole('combobox').selectOption(competencia.id);
    const respostaAvaliacao = page.waitForResponse((r) => r.url().includes('/avaliacoes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registrar' }).click();
    expect((await respostaAvaliacao).status()).toBe(201);

    const evidencia = await prisma.competencyEvidence.findFirst({ where: { subjectUserId: vend001.id, competencyId: competencia.id, sourceType: 'MANAGER_ASSESSMENT' } });
    expect(evidencia).not.toBeNull();
    expect(evidencia!.normalizedScore).toBe(60); // rating default do form é 3 -> 3/5*100 = 60

    // 4. Nunca acessa vendedor de outra loja, nem por API direta.
    const token = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const statusCross = await page.evaluate(
      async ({ api, tok, vendedorId }) => (await fetch(`${api}/universidade/equipe/${vendedorId}/desenvolvimento`, { headers: { Authorization: `Bearer ${tok}` } })).status,
      { api: API, tok: token, vendedorId: vendedorDeOutraLoja.id }
    );
    expect(statusCross).toBe(404);

    await prisma.$disconnect();
  });
});
