// E2E real: navegador de verdade + backend real — cobre o ciclo de
// desenvolvimento da Universidade (Fatia 7.5E): Admin mapeia uma
// competência a uma aula real → vendedor responde o quiz corretamente
// (evidência real, nunca IA) → Minha Evolução mostra o score calculado
// pelo backend → certificação com requisito de score vira elegível →
// vendedor emite → aparece na lista de certificações ativas.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3010';
// Mesmo raciocínio de jornada-missoes-aprendizado.spec.ts: o gabarito nunca
// é exposto pelo frontend/API — o teste lê a resposta certa direto do
// banco por um canal que só o teste tem acesso, nunca o navegador.
const prisma = new PrismaClient();

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Perfil' }).waitFor();
}

async function tokenAtual(page: Page) {
  return page.evaluate(() => localStorage.getItem('vendedor-ia:token'));
}

test.describe('Jornada Universidade — Vendedor', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:universidade-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Admin mapeia competência numa aula real → vendedor responde quiz corretamente → Minha Evolução mostra score real → certificação fica elegível e é emitida', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');
    const tokenAdmin = await tokenAtual(page);

    const aula = await prisma.academyLesson.findFirstOrThrow({ where: { code: 'FUND_ABERTURA' } });
    const perguntas = await prisma.academyQuestion.findMany({ where: { quiz: { lessonId: aula.id } }, include: { opcoes: true } });

    // 1. Admin: cria competência + certificação, mapeia na aula real.
    const competencyId: string = await page.evaluate(
      async ({ api, tok, lessonId }) => {
        const competencia = await (
          await fetch(`${api}/admin/universidade/competencias`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: `e2e-abordagem-${Date.now()}`, name: 'Abordagem (E2E)', description: 'd' }),
          })
        ).json();
        await fetch(`${api}/admin/universidade/mapear`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'lesson', contentId: lessonId, competencyIds: [competencia.id] }),
        });
        return competencia.id;
      },
      { api: API, tok: tokenAdmin, lessonId: aula.id }
    );

    const definitionId: string = await page.evaluate(
      async ({ api, tok, lessonId }) => {
        const def = await (
          await fetch(`${api}/admin/universidade/certificacoes`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: `e2e-cert-${Date.now()}`, name: 'Certificação de Abordagem (E2E)', description: 'd' }),
          })
        ).json();
        await fetch(`${api}/admin/universidade/certificacoes/${def.id}/requisitos`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requisitos: [{ tipo: 'QUIZ_MIN_SCORE', refId: lessonId, minScore: 50 }] }),
        });
        for (const transicao of ['submeter', 'aprovar', 'publicar']) {
          await fetch(`${api}/admin/universidade/certificacoes/${def.id}/${transicao}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
        }
        return def.id;
      },
      { api: API, tok: tokenAdmin, lessonId: aula.id }
    );

    // 2. Vendedor responde o quiz corretamente pela UI real da Academia (1ª
    // evidência real). A Academia esconde "Ir para o quiz" depois que a
    // aula já está COMPLETED (não dá pra "refazer" pela UI) — a 2ª
    // evidência (só pra cruzar o mínimo de 2 e o score aparecer) vem de uma
    // 2ª submissão real ao mesmo endpoint que a UI usa, exercitando o mesmo
    // caminho de geração de evidência no backend.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'VEND001', 'vendedor123');

    await page.goto('/academia');
    await page.getByRole('button', { name: /Como abrir bem um atendimento/ }).click();
    await page.getByRole('button', { name: 'Ir para o quiz' }).click();
    for (const pergunta of perguntas) {
      const opcaoCerta = pergunta.opcoes.find((o) => o.correct)!;
      await page.locator(`input[type="radio"][value="${opcaoCerta.id}"]`).check();
    }
    await page.getByRole('button', { name: 'Enviar respostas' }).click();
    await expect(page.getByText('Aprovado!')).toBeVisible();

    const tokenVendedorPrimeiraTentativa = await tokenAtual(page);
    await page.evaluate(
      async ({ api, tok, lessonId, respostas }) => {
        await fetch(`${api}/academia/aulas/${lessonId}/quiz/responder`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ respostas }),
        });
      },
      {
        api: API,
        tok: tokenVendedorPrimeiraTentativa,
        lessonId: aula.id,
        respostas: perguntas.map((p) => ({ questionId: p.id, optionId: p.opcoes.find((o) => o.correct)!.id })),
      }
    );

    // 3. Minha Evolução mostra um score real (nunca "sem dados suficientes"
    // depois de 2 evidências reais com nota máxima).
    await page.goto('/universidade');
    // Escopado ao card da PRÓPRIA competência (nunca a página inteira): o
    // catálogo de competências cresceu ao longo de várias fatias e agora tem
    // várias outras ainda em NOT_ENOUGH_DATA na mesma tela — checar a página
    // toda faria o locator ficar ambíguo (strict mode) sem essa competência
    // ter, de fato, nenhuma relação com as demais.
    const cardCompetencia = page.locator('.rounded-2xl.bg-surface', { hasText: 'Abordagem (E2E)' });
    await expect(cardCompetencia).toBeVisible();
    await expect(cardCompetencia.getByText(/Ainda sem dados suficientes/)).not.toBeVisible();
    await expect(cardCompetencia.getByText('100')).toBeVisible();

    // 4. Certificação com requisito de score >=50 fica elegível de verdade
    // (score real é 100) — Admin nunca "decidiu" isso, o backend calculou.
    await page.getByRole('button', { name: 'Certificações' }).click();
    await expect(page.getByText('Certificação de Abordagem (E2E)')).toBeVisible();
    await page.getByRole('button', { name: 'Emitir' }).click();
    await expect(page.getByText('ativa')).toBeVisible();

    const tokenVendedor = await tokenAtual(page);
    const emitidas = await page.evaluate(async ({ api, tok }) => (await fetch(`${api}/universidade/certificacoes`, { headers: { Authorization: `Bearer ${tok}` } })).json(), {
      api: API,
      tok: tokenVendedor,
    });
    expect(emitidas.certificacoes.some((c: { definitionId: string }) => c.definitionId === definitionId)).toBe(true);

    await prisma.$disconnect();
  });
});
