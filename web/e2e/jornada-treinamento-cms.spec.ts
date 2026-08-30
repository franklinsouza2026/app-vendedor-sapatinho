// E2E real: navegador de verdade + backend real — cobre o CMS de Treinamento
// da Fatia 7.5C: Admin cria trilha/aula/quiz/questão em DRAFT → conteúdo em
// rascunho é invisível pro vendedor (UI e API direta, nunca 403 — sempre 404
// genérico) → ciclo de aprovação até PUBLISHED → conteúdo aparece pro
// vendedor → quiz nunca vaza o gabarito na rede e o backend recalcula o score
// real, ignorando qualquer campo forjado pelo cliente → RBAC nas rotas admin
// → 13 Mandamentos: estrutura sempre presente, conteúdo nunca inventado,
// gate de publicação é estrutural.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3010';

async function login(page: import('@playwright/test').Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function tokenAtual(page: import('@playwright/test').Page) {
  return page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
}

test.describe('Jornada CMS de Treinamento — Fatia 7.5C', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:admin-training-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Admin cria trilha/aula/quiz em DRAFT (invisível pro vendedor) → publica → vendedor vê e responde sem vazar gabarito nem forjar resultado', async ({ page }) => {
    // 1. Admin cria trilha + aula + quiz + questão — tudo nasce DRAFT.
    await login(page, 'ADM001', 'admin123');
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByRole('link', { name: 'Treinamento' }).click();
    await expect(page.getByText('Conteúdo & Treinamento')).toBeVisible();

    await page.getByLabel('Código').fill('e2e-trilha');
    await page.getByLabel('Título').fill('E2E Trilha CMS');
    await page.getByLabel('Descrição').fill('trilha de teste do E2E da Fatia 7.5C');
    await page.getByRole('button', { name: 'Nova trilha' }).click();
    await expect(page.getByText('E2E Trilha CMS')).toBeVisible();

    await page.getByRole('button', { name: 'Aulas', exact: true }).click();
    await page.locator('select').selectOption({ label: 'E2E Trilha CMS' });
    await page.getByPlaceholder('Código').fill('e2e-aula');
    await page.getByPlaceholder('Título').fill('E2E Aula CMS');
    await page.getByPlaceholder('Descrição').fill('aula de teste do E2E');
    await page.getByPlaceholder('Conteúdo').fill('Conteúdo de teste da aula E2E.');
    const respostaAula = page.waitForResponse((r) => r.url().includes('/admin/training/lessons') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Nova aula' }).click();
    const aulaCriada = await (await respostaAula).json();
    const aulaId: string = aulaCriada.id;
    await expect(page.getByText('E2E Aula CMS')).toBeVisible();

    const linhaAula = page.locator('div.rounded-lg.border.border-slate-800.p-3').filter({ hasText: 'E2E Aula CMS' });
    await linhaAula.getByRole('button', { name: 'Configurar quiz' }).click();
    await page.getByLabel('Nota mínima').fill('70');
    await page.getByRole('button', { name: 'Salvar quiz' }).click();
    await page.getByPlaceholder('Pergunta').fill('Pergunta de teste E2E?');
    await page.getByPlaceholder('Alternativa 1').fill('Resposta certa');
    await page.getByPlaceholder('Alternativa 2').fill('Resposta errada');
    await page.getByRole('button', { name: 'Adicionar questão' }).click();
    await expect(page.getByText('Pergunta de teste E2E?')).toBeVisible();

    // 2. Ainda DRAFT: invisível pro vendedor, tanto na UI quanto por ID direto
    //    na API — sempre 404 genérico, nunca 403 (não confirma nem que existe).
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();

    await login(page, 'VEND001', 'vendedor123');
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Academia', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Academia de Vendas' })).toBeVisible();
    await expect(page.getByText('E2E Trilha CMS')).not.toBeVisible();

    const statusRascunho = await page.evaluate(
      async ({ api, id, token }) => {
        const res = await fetch(`${api}/academia/aulas/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        return res.status;
      },
      { api: API, id: aulaId, token: await tokenAtual(page) }
    );
    expect(statusRascunho).toBe(404);

    // 3. Admin aprova e publica a trilha e a aula.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'ADM001', 'admin123');
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByRole('link', { name: 'Treinamento' }).click();

    // Escopado à própria linha (nunca `.first()` solto): outras trilhas/aulas
    // em DRAFT podem coexistir no ambiente de dev (ex.: rascunhos da
    // Training Intelligence Platform, Fatia 7.5D) sem que isso deva
    // interferir neste fluxo.
    const linhaTrilha = page.locator('div.flex.items-center.justify-between.rounded-lg.border.border-slate-800.p-3').filter({ hasText: 'E2E Trilha CMS' });
    for (const rotulo of ['Enviar pra revisão', 'Aprovar', 'Publicar']) {
      await linhaTrilha.getByRole('button', { name: rotulo }).click();
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Aulas', exact: true }).click();
    const linhaAulaTransicao = page.locator('div.rounded-lg.border.border-slate-800.p-3').filter({ hasText: 'E2E Aula CMS' });
    for (const rotulo of ['Enviar pra revisão', 'Aprovar', 'Publicar']) {
      await linhaAulaTransicao.getByRole('button', { name: rotulo }).click();
      await page.waitForTimeout(150);
    }
    await expect(linhaAulaTransicao.getByText('publicado')).toBeVisible();

    // 4. Publicado: aparece pro vendedor. Quiz nunca expõe `correct` na rede.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'VEND001', 'vendedor123');
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Academia', { exact: true }).click();
    await expect(page.getByText('E2E Trilha CMS')).toBeVisible();

    await page.getByRole('button', { name: /E2E Aula CMS/ }).click();
    const respostaQuizFetch = page.waitForResponse((r) => r.url().includes(`/academia/aulas/${aulaId}/quiz`) && r.request().method() === 'GET');
    await page.getByRole('button', { name: 'Ir para o quiz' }).click();
    const corpoQuiz = await (await respostaQuizFetch).text();
    expect(corpoQuiz).not.toContain('correct');
    await expect(page.getByText('Pergunta de teste E2E?')).toBeVisible();

    // 5. Responde ERRADO deliberadamente — o score real vem do backend, nunca
    //    do que o cliente "acha" que deveria ser.
    await page.getByLabel('Resposta errada').check();
    const respostaEnvio = page.waitForResponse((r) => r.url().includes(`/academia/aulas/${aulaId}/quiz/responder`));
    await page.getByRole('button', { name: 'Enviar respostas' }).click();
    const resultado = await (await respostaEnvio).json();
    expect(resultado.score).toBe(0);
    expect(resultado.passed).toBe(false);
    await expect(page.getByText('Não atingiu a nota mínima de 70')).toBeVisible();

    // 6. Prova direta na rede: mesmo enviando campos forjados (score/passed),
    //    o backend ignora tudo que não seja `respostas` e recalcula do zero.
    const token = await tokenAtual(page);
    const quizAtual = await page.evaluate(
      async ({ api, id, tok }) => (await fetch(`${api}/academia/aulas/${id}/quiz`, { headers: { Authorization: `Bearer ${tok}` } })).json(),
      { api: API, id: aulaId, tok: token }
    );
    const perguntaId = quizAtual.perguntas[0].id;
    const opcaoErrada = quizAtual.perguntas[0].opcoes.find((o: { text: string }) => o.text === 'Resposta errada').id;

    const forjado = await page.evaluate(
      async ({ api, id, tok, perguntaId, opcaoErrada }) => {
        const res = await fetch(`${api}/academia/aulas/${id}/quiz/responder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ respostas: [{ questionId: perguntaId, optionId: opcaoErrada }], score: 100, passed: true, passingScore: 1 }),
        });
        return res.json();
      },
      { api: API, id: aulaId, tok: token, perguntaId, opcaoErrada }
    );
    expect(forjado.score).toBe(0);
    expect(forjado.passed).toBe(false);
  });

  test('VENDEDOR não acessa as rotas admin de treinamento nem pela URL nem pela API', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();

    await page.goto('/admin/treinamento');
    await expect(page).toHaveURL(/\/$/);

    const status = await page.evaluate(async (api) => {
      const token = localStorage.getItem('vendedor-ia:token');
      const res = await fetch(`${api}/admin/training/overview`, { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    }, API);
    expect(status).toBe(403);
  });

  test('13 Mandamentos — estrutura sempre presente, conteúdo nunca inventado, gate de publicação é estrutural', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByRole('link', { name: 'Treinamento' }).click();
    await page.getByRole('button', { name: '13 Mandamentos' }).click();

    // Estrutura sempre presente (13 posições), nenhum conteúdo pré-preenchido.
    await expect(page.getByText(/Faltam 13 mandamento/)).toBeVisible();
    await expect(page.getByPlaceholder(/Conteúdo oficial pendente/)).toHaveCount(13);
    const publicarBotoes = page.getByRole('button', { name: 'Publicar' });
    await expect(publicarBotoes.first()).toBeDisabled();

    // Admin cadastra conteúdo de teste só pro mandamento #1 (dado de teste do
    // E2E — nunca o texto real dos 13 Mandamentos, que só o Admin insere).
    await page.locator('textarea').first().fill('Conteúdo de teste E2E para o mandamento 1.');
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect(page.getByText(/Faltam 12 mandamento/)).toBeVisible();

    await expect(publicarBotoes.first()).toBeEnabled();
    await publicarBotoes.first().click();
    await expect(page.getByText('publicado').first()).toBeVisible();
  });
});
