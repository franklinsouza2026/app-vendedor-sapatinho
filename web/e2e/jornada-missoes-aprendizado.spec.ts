// E2E real: navegador de verdade + backend real — jornada de aprendizagem
// (Fatia 7, seção 53): completar um recurso da Academia que satisfaz DUAS
// missões ao mesmo tempo (COMPLETE_LESSON e PASS_QUIZ, já que passar no quiz
// também marca a aula como concluída) e confirmar que cada uma recebe sua
// própria evidência/estado sem nenhuma duplicação de recompensa entre elas
// nem ao atualizar a página depois.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// O gabarito nunca é exposto pelo frontend/API (seção 10 da Fatia 6/7 —
// "regra de ouro") — pra montar um E2E determinístico (nunca dependente de
// adivinhar a ordem das alternativas), o teste lê a resposta certa direto do
// banco, do mesmo jeito que o backend faz, mas por um canal que só o teste
// tem acesso (nunca o navegador).
const prisma = new PrismaClient();

test.describe('Jornada de Missões — aprendizagem (Academia)', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:missoes-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('passar num quiz conclui COMPLETE_LESSON e PASS_QUIZ juntas, sem recompensa duplicada', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();

    // A Home é sempre visitada primeiro no fluxo real — é ela que atribui as
    // missões do dia (garantirMissoesDoDia). Pular esse passo e completar a
    // aula/quiz ANTES de qualquer atribuição faria a recomendação nunca
    // sugerir COMPLETE_LESSON/PASS_QUIZ pro dia (já "cumpridos" antes mesmo
    // de existir a missão — limitação v1 documentada em
    // 05-Decisoes-e-Tradeoffs.md).
    await expect(page.getByText('Missões de hoje')).toBeVisible();

    // 1. Ir pra Academia (via Evoluir) e responder um quiz de verdade
    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await page.getByText('Academia', { exact: true }).click();
    await page.getByRole('button', { name: /Como abrir bem um atendimento/ }).click();
    await page.getByRole('button', { name: 'Ir para o quiz' }).click();
    await expect(page.getByText('Quiz')).toBeVisible();

    // Marca a opção realmente correta de cada pergunta (lida do banco, nunca
    // adivinhada) — garante 100% e uma aprovação determinística, sem
    // depender da ordem em que o seed cadastrou as alternativas.
    const aula = await prisma.academyLesson.findFirstOrThrow({ where: { title: 'Como abrir bem um atendimento' } });
    const perguntas = await prisma.academyQuestion.findMany({
      where: { quiz: { lessonId: aula.id } },
      include: { opcoes: true },
    });
    for (const pergunta of perguntas) {
      const opcaoCerta = pergunta.opcoes.find((o) => o.correct)!;
      await page.locator(`input[type="radio"][value="${opcaoCerta.id}"]`).check();
    }

    await page.getByRole('button', { name: 'Enviar respostas' }).click();
    await expect(page.getByText('Aprovado!')).toBeVisible();

    // 2. As duas missões de Academia aparecem concluídas em /missoes
    await page.goto('/missoes');
    const concluidas = page.getByText('Concluída ✓');
    await expect(concluidas).toHaveCount(2);

    // 3. Carteira reflete os eventos base reais (quiz aprovado + treinamento
    // concluído) — nunca inventados pelo LLM/frontend, e nunca duplicados.
    await page.goto('/moedas');
    await expect(page.getByText('Quiz aprovado')).toHaveCount(1);
    await expect(page.getByText('Treinamento concluído')).toHaveCount(1);

    // 4. Atualizar tudo de novo não duplica nenhuma linha do extrato.
    await page.goto('/missoes');
    await expect(page.getByText('Concluída ✓')).toHaveCount(2);
    await page.goto('/moedas');
    await expect(page.getByText('Quiz aprovado')).toHaveCount(1);
    await expect(page.getByText('Treinamento concluído')).toHaveCount(1);

    await prisma.$disconnect();
  });
});
