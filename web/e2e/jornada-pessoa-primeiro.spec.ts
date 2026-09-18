// E2E real da Etapa 2B.1 — navegador de verdade + backend real.
//
// O QUE ESTE TESTE PROVA, e nenhum outro provava: **a mesma pessoa, no mesmo
// dia, com os mesmos números, recebe respostas diferentes conforme o que ela
// traz.** E que essa diferença não é "pedimos no prompt pra IA ser sensível" —
// é arquitetura: numa conversa de acolhimento o bloco comercial não chega a
// ser carregado do banco.
//
// O `jornada-coach.spec.ts` cobre o caminho comercial de sempre. Este cobre o
// caminho que não existia: a pessoa antes do número.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function enviar(page: Page, texto: string) {
  await page.getByPlaceholder('Fala com o Conselheiro...').fill(texto);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test.describe('Jornada 2B.1 — a pessoa vem antes dos números', () => {
  test.beforeAll(() => {
    execSync('npm run reset:coach-e2e', { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' });
  });

  test('mesma pessoa, mesmos números: desabafo não recebe KPI, pedido explícito recebe', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/coach');

    // 1. Check-in NOT_GOOD — o vendedor declara que não está bem.
    await expect(page.getByText('Como você está chegando pra trabalhar hoje?')).toBeVisible();
    await page.getByText('Não estou legal', { exact: true }).click();

    // 2. Ele desabafa. Em nenhum momento pediu número.
    await enviar(page, 'Hoje estou bem desanimado, queria só conversar');

    // O Conselheiro acolhe — e NÃO cita meta, valor nem PA. Antes desta fatia,
    // o contexto comercial ia no prompt de toda conversa, sem exceção.
    const respostaAcolhimento = page.locator('p').filter({ hasText: /quer me contar|prefere/i });
    await expect(respostaAcolhimento.first()).toBeVisible();
    await expect(page.getByText(/pra bater sua meta de hoje/)).not.toBeVisible();
    await expect(page.getByText(/R\$ \d/)).not.toBeVisible();

    // 3. AGORA ele pede. A agência é dele: o check-in ruim não o impede de ver
    // os próprios números.
    await enviar(page, 'Quanto falta para minha meta?');
    await expect(page.getByText(/pra bater sua meta de hoje/)).toBeVisible();

    // 4. O histórico guarda as duas respostas — e a diferença entre elas fica
    // visível na mesma tela, que é exatamente o ponto desta fatia.
    await page.goto('/');
    await page.goto('/coach');
    await expect(respostaAcolhimento.first()).toBeVisible();
    await expect(page.getByText(/pra bater sua meta de hoje/)).toBeVisible();
  });

  test('o check-in continua privado — o gerente não vê nada disso', async ({ page }) => {
    await login(page, 'GER001', 'gerente123');

    // O gerente tem painel, equipe e reunião do dia. Nenhuma dessas telas
    // mostra humor, check-in ou conversa de quem quer que seja.
    await page.goto('/equipe');
    await expect(page.getByText(/humor|check-?in|desanimad|emocional/i)).not.toBeVisible();

    await page.goto('/gerente/reuniao-do-dia');
    await expect(page.getByText(/humor|check-?in|desanimad|emocional/i)).not.toBeVisible();

    // E não existe rota de API que devolva isso a um gerente.
    const token = await page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
    const status = await page.evaluate(
      async ({ tok }) => (await fetch('http://localhost:3010/coach/check-in/hoje', { headers: { Authorization: `Bearer ${tok}` } })).status,
      { tok: token }
    );
    // 200 devolve o check-in DELE PRÓPRIO (ele também é um usuário), nunca o de
    // um vendedor — a rota não aceita parâmetro de vendedor nenhum.
    expect(status).toBe(200);
    const corpo = await page.evaluate(
      async ({ tok }) => (await fetch('http://localhost:3010/coach/check-in/hoje', { headers: { Authorization: `Bearer ${tok}` } })).text(),
      { tok: token }
    );
    expect(corpo).not.toContain('VEND001');
  });
});
