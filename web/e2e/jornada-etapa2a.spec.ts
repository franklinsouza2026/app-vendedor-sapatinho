// E2E real da CADEIA DE DESENVOLVIMENTO (Etapa 2A) — navegador de verdade +
// backend real.
//
// O QUE ESTE TESTE PROVA, que nenhum outro provava: a cadeia funciona numa
// instalação NOVA, sem ninguém configurar nada no Admin.
//
// O `jornada-universidade-vendedor.spec.ts` já cobria score e certificação,
// mas ele começava criando uma competência de teste e MAPEANDO ela na aula via
// API de Admin. Era exatamente isso que escondia o gargalo: em produção
// ninguém faz esse passo, o seed nunca preenchia `competencyIds`, e a
// Universidade inteira ficava inerte (a auditoria mediu 2 evidências e 0 PDIs
// num banco que já tinha rodado todas as fatias).
//
// Aqui não há passo de Admin nenhum. O conteúdo já vem mapeado pelo seed, e a
// cadeia corre sozinha: aula → evidência → score → gap → sugestão da IA →
// plano do gerente → próxima ação clicável na tela do vendedor.
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
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function sair(page: Page) {
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/login'));
}

test.describe('Jornada Etapa 2A — cadeia de desenvolvimento ponta a ponta', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:universidade-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('aula seedada gera evidência sem passo de Admin → gap vira sugestão → gerente cria plano → vendedor vê a próxima ação com título e link', async ({ page }) => {
    const aula = await prisma.academyLesson.findFirstOrThrow({ where: { code: 'FUND_ABERTURA' } });
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    // O seed mapeia a aula a uma competência REAL do catálogo. Este é o elo que
    // não existia — sem ele, nada abaixo acontece.
    expect(Array.isArray(aula.competencyIds) && (aula.competencyIds as string[]).length).toBeGreaterThan(0);
    const competencia = await prisma.competency.findUniqueOrThrow({ where: { id: (aula.competencyIds as string[])[0] } });

    const perguntas = await prisma.academyQuestion.findMany({ where: { quiz: { lessonId: aula.id } }, include: { opcoes: true } });

    // 1. Vendedor estuda pela UI real — nenhuma chamada de API, nenhum Admin.
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/academia');
    await page.getByRole('button', { name: /Como abrir bem um atendimento/ }).click();
    await page.getByRole('button', { name: 'Ir para o quiz' }).click();
    for (const pergunta of perguntas) {
      // Erra de propósito a 1ª pra sobrar gap: o objetivo aqui é a cadeia
      // completa, e sem gap não há recomendação nem plano pra testar.
      const opcao = pergunta === perguntas[0] ? pergunta.opcoes.find((o) => !o.correct)! : pergunta.opcoes.find((o) => o.correct)!;
      await page.locator(`input[type="radio"][value="${opcao.id}"]`).check();
    }
    await page.getByRole('button', { name: 'Enviar respostas' }).click();

    // 2. A evidência nasceu sozinha, na competência certa.
    await expect
      .poll(() => prisma.competencyEvidence.count({ where: { subjectUserId: vend001.id, competencyId: competencia.id } }))
      .toBeGreaterThan(0);

    // 3. O gerente observa o vendedor em loja e registra a avaliação — segunda
    // evidência REAL, por outro caminho (o motor exige no mínimo duas antes de
    // arriscar um score).
    await sair(page);
    await login(page, 'GER001', 'gerente123');
    await page.goto('/perfil');
    await page.getByRole('link', { name: 'Minha Equipe' }).click();
    await page.getByText(vend001.nome, { exact: true }).click();
    await expect(page.getByRole('heading', { name: vend001.nome })).toBeVisible();

    const formAvaliacao = page.locator('form').filter({ hasText: 'Registrar avaliação' });
    await formAvaliacao.getByRole('combobox').selectOption(competencia.id);
    await formAvaliacao.getByRole('spinbutton').fill('1');
    const respostaAvaliacao = page.waitForResponse((r) => r.url().includes('/avaliacoes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registrar' }).click();
    expect((await respostaAvaliacao).status()).toBe(201);

    // 4. Agora há score e gap — e o gerente pede o que o vendedor deve estudar.
    // Antes da Etapa 2A esta sugestão vinha SEMPRE vazia numa instalação nova:
    // o filtro procura aulas por `competencyIds`, e nenhuma aula tinha.
    // Sem `reload()`: o detalhe do vendedor é estado de componente, não rota —
    // recarregar a página voltaria pra lista da equipe. A própria tela já
    // recarrega a matriz depois de registrar a avaliação.
    const cardCompetencia = page.locator('.rounded-2xl.bg-surface', { hasText: competencia.name });
    await cardCompetencia.getByRole('button', { name: 'Sugerir conteúdo com IA' }).click();
    await expect(page.getByText('Sugestões de IA (revise antes de atribuir)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar plano com estas etapas' })).toBeVisible();

    // 5. O gerente revisa e atribui — a autoria do plano é dele, não da IA.
    const respostaPDI = page.waitForResponse((r) => r.url().includes('/pdi') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Criar plano com estas etapas' }).click();
    expect((await respostaPDI).status()).toBe(201);

    const plano = await prisma.developmentPlan.findFirstOrThrow({ where: { subjectUserId: vend001.id }, include: { itens: true } });
    expect(plano.createdBy).not.toBeNull(); // criado por uma pessoa, sempre
    expect(plano.itens.length).toBeGreaterThan(0);

    // 6. O vendedor abre o plano e encontra uma PRÓXIMA AÇÃO de verdade: com
    // título do conteúdo (não "Aula") e um link que leva a uma tela que existe.
    await sair(page);
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/universidade?aba=plano');
    await page.getByText(competencia.name).first().click();

    const etapa = page.getByRole('link').filter({ hasText: aula.title });
    await expect(etapa).toBeVisible();
    await etapa.click();
    await expect(page).toHaveURL(/\/academia/);

    await prisma.$disconnect();
  });
});
