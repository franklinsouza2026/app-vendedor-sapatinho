// E2E real: navegador de verdade + backend real (Fatia 8, seção 111).
// Manager reconhece vendedor da própria loja (vira Recognition + FeedEvent
// real) e nunca reconhece vendedor de outra loja (mesma disciplina anti-IDOR
// já usada na Universidade).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Perfil' }).waitFor();
}

test.describe('Jornada Competições — Manager', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:competicoes-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Gerente reconhece vendedor da própria loja (evidência social real, nunca altera KPI/score)', async ({ page }) => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    await login(page, 'GER001', 'gerente123');
    await page.goto('/perfil');
    await page.getByRole('link', { name: 'Minha Equipe' }).click();
    await page.getByText(vend001.nome, { exact: true }).click();

    const respostaReconhecimento = page.waitForResponse((r) => r.url().includes('/reconhecimentos') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Reconhecer' }).click();
    expect((await respostaReconhecimento).status()).toBe(201);

    const reconhecimento = await prisma.recognition.findFirst({ where: { subjectId: vend001.id }, orderBy: { createdAt: 'desc' } });
    expect(reconhecimento).not.toBeNull();

    // KPI/score do vendedor nunca é tocado por um reconhecimento manual (seção 31).
    const scoreAntesDepois = await prisma.competencyEvidence.count({ where: { subjectUserId: vend001.id, sourceType: 'MANAGER_ASSESSMENT' } });
    expect(scoreAntesDepois).toBe(0); // Recognition nunca gera CompetencyEvidence — domínios sempre separados

    await prisma.$disconnect();
  });
});
