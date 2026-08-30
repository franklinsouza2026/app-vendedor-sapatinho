// E2E real: navegador de verdade + backend real + worker real (BullMQ) +
// MOCK AI + MockResearchSourceProvider — cobre a Training Intelligence
// Platform da Fatia 7.5D: Admin pede um treinamento em linguagem natural →
// job roda em background (pesquisa→curadoria→design→quiz→simulação→
// governança) → chega em WAITING_REVIEW → nunca publica sozinho → Admin
// aprova → ainda precisa publicar manualmente pelo CMS (sem atalho) →
// vendedor só vê depois de publicado de verdade. Rejeitar arquiva e nunca
// aparece ao vendedor.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3010';

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Landmark universal (todo papel vê "Perfil" na bottom nav) — sem isso,
  // ler localStorage logo em seguida corre uma condição de corrida contra o
  // login assíncrono (token ainda não salvo).
  await page.getByRole('link', { name: 'Perfil' }).waitFor();
}

async function abrirIaDeTreinamento(page: Page) {
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: 'Administração' }).click();
  await page.getByRole('link', { name: 'Treinamento' }).click();
  await page.getByRole('button', { name: 'IA de Treinamento' }).click();
}

async function aguardarRevisao(page: Page, maxTentativas = 20) {
  for (let i = 0; i < maxTentativas; i++) {
    if (await page.getByRole('button', { name: 'Aprovar' }).isVisible().catch(() => false)) return;
    const botaoAtualizar = page.getByRole('button', { name: 'Atualizar' });
    if (await botaoAtualizar.isVisible().catch(() => false)) await botaoAtualizar.click();
    await page.waitForTimeout(400);
  }
  throw new Error('job não chegou em WAITING_REVIEW a tempo — worker de Training Intelligence pode não estar rodando');
}

test.describe('Jornada Training Intelligence — Fatia 7.5D', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:training-ia-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Admin pede treinamento em linguagem natural → job roda em background → WAITING_REVIEW → nunca publica sozinho → aprova → publica manualmente pelo CMS → vendedor só vê depois de publicado', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');
    await abrirIaDeTreinamento(page);

    await page.getByPlaceholder(/Crie um treinamento/).fill('Crie um treinamento para vendedores sobre venda complementar de calçados');
    await page.getByRole('button', { name: 'Gerar rascunho com IA' }).click();

    await expect(page.getByRole('button', { name: /Crie um treinamento para vendedores sobre venda complementar de calçados/ })).toBeVisible();
    await page.getByRole('button', { name: /Crie um treinamento para vendedores sobre venda complementar de calçados/ }).click();

    await aguardarRevisao(page);
    await expect(page.getByText(/Rascunho de aula/)).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const jobId = await page.evaluate(async (api) => {
      const jobs = await (await fetch(`${api}/admin/training/ai/jobs`, { headers: { Authorization: `Bearer ${localStorage.getItem('vendedor-ia:token')}` } })).json();
      return jobs.jobs[0].id;
    }, API);
    const detalheAntes = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/admin/training/ai/jobs/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json(),
      { api: API, id: jobId, tok: token }
    );
    const lessonId: string = detalheAntes.draftLesson.id;

    // Ainda invisível pro vendedor, mesmo com o job em WAITING_REVIEW.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'VEND001', 'vendedor123');
    const tokenVendedor = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const statusAntesDeAprovar = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/academia/aulas/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).status,
      { api: API, id: lessonId, tok: tokenVendedor }
    );
    expect(statusAntesDeAprovar).toBe(404);

    // Admin aprova o job — isso NUNCA publica a aula sozinha.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'ADM001', 'admin123');
    await abrirIaDeTreinamento(page);
    await page.getByRole('button', { name: /Crie um treinamento para vendedores sobre venda complementar de calçados/ }).click();
    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByRole('button', { name: 'Aprovar' })).not.toBeVisible();

    const statusDepoisDeAprovarJob = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/academia/aulas/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).status,
      { api: API, id: lessonId, tok: tokenVendedor }
    );
    expect(statusDepoisDeAprovarJob).toBe(404); // aprovar o JOB não publica — precisa do CMS manual

    // Publica de verdade pelo CMS manual (sem atalho — mesmos 3 cliques de sempre).
    await page.getByRole('button', { name: 'Aulas', exact: true }).click();
    const linhaAula = page.locator('div.rounded-lg.border.border-slate-800.p-3').filter({ hasText: /treinamento gerado por IA/ });
    for (const rotulo of ['Enviar pra revisão', 'Aprovar', 'Publicar']) {
      await linhaAula.getByRole('button', { name: rotulo }).click();
      await page.waitForTimeout(150);
    }

    const statusDepoisDePublicarDeVerdade = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/academia/aulas/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).status,
      { api: API, id: lessonId, tok: tokenVendedor }
    );
    expect(statusDepoisDePublicarDeVerdade).toBe(200);
  });

  test('rejeitar um job arquiva o rascunho — nunca aparece ao vendedor, histórico do job preservado', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');
    await abrirIaDeTreinamento(page);

    await page.getByPlaceholder(/Crie um treinamento/).fill('Crie um treinamento sobre objeção de preço');
    await page.getByRole('button', { name: 'Gerar rascunho com IA' }).click();
    await page.getByRole('button', { name: /Crie um treinamento sobre objeção de preço/ }).click();
    await aguardarRevisao(page);

    const token = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const jobId = await page.evaluate(async (api) => {
      const jobs = await (await fetch(`${api}/admin/training/ai/jobs`, { headers: { Authorization: `Bearer ${localStorage.getItem('vendedor-ia:token')}` } })).json();
      return jobs.jobs.find((j: { topic: string }) => j.topic.includes('objeção de preço')).id;
    }, API);
    const detalheAntes = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/admin/training/ai/jobs/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json(),
      { api: API, id: jobId, tok: token }
    );
    const lessonId: string = detalheAntes.draftLesson.id;

    await page.getByRole('button', { name: 'Rejeitar' }).click();
    await expect(page.getByRole('button', { name: 'Rejeitar' })).not.toBeVisible();

    // Job continua consultável (histórico preservado — nunca apagado).
    const jobDepois = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/admin/training/ai/jobs/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).json(),
      { api: API, id: jobId, tok: token }
    );
    expect(jobDepois.job.status).toBe('COMPLETED');
    expect(jobDepois.job.reviewOutcome).toBe('REJECTED');
    expect(jobDepois.draftLesson.status).toBe('ARCHIVED');

    // Nunca aparece ao vendedor, nem por ID direto.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'VEND001', 'vendedor123');
    const tokenVendedor = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const statusParaVendedor = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/academia/aulas/${id}`, { headers: { Authorization: `Bearer ${tok}` } })).status,
      { api: API, id: lessonId, tok: tokenVendedor }
    );
    expect(statusParaVendedor).toBe(404);
  });
});
