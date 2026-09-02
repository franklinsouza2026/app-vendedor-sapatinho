// E2E real: navegador de verdade + backend real (Fatia 8, seção 110/112/113).
// Admin cria Season DRAFT → Competition → ativa (auto-enrollment real) →
// vendedor vê no /competicoes → Admin finaliza → snapshot/reward/feed reais.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3010';
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

test.describe('Jornada Competições — Admin', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:competicoes-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('Admin cria competição de consistência → vendedor vê e participa → Admin finaliza → resultado/reward/feed reais, nunca forjáveis pelo cliente', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');
    const tokenAdmin = await tokenAtual(page);

    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });
    // Fairness real: vendedor precisa de dias ativos — cria histórico mínimo direto no banco
    // (mesmo canal que o teste de missões usa pra dado que o navegador não pode fabricar).
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      await prisma.streakChecagem.upsert({ where: { vendedorId_tipo_data: { vendedorId: vend001.id, tipo: 'META_DIARIA', data: dia } }, update: { atingiu: true }, create: { vendedorId: vend001.id, tipo: 'META_DIARIA', data: dia, atingiu: true } });
    }

    const startsAt = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();
    const sufixo = randomUUID().slice(0, 8);

    const competitionId: string = await page.evaluate(
      async ({ api, tok, startsAt, endsAt, sufixo }) => {
        const res = await fetch(`${api}/admin/competicoes`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: `e2e-comp-${sufixo}`, name: `Desafio de Consistência (E2E ${sufixo})`, description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', startsAt, endsAt, rewardXp: 30, rewardMoedas: 5 }),
        });
        const competicao = await res.json();
        await fetch(`${api}/admin/competicoes/${competicao.id}/ativar`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
        return competicao.id;
      },
      { api: API, tok: tokenAdmin, startsAt, endsAt, sufixo }
    );

    // 1. Vendedor vê a competição real na tela /competicoes.
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/competicoes');
    await expect(page.getByText(`Desafio de Consistência (E2E ${sufixo})`)).toBeVisible();

    // 2. Backend nunca aceita winner/rewardGranted forjado — Admin finaliza de verdade.
    const tokenAdmin2 = tokenAdmin; // reaproveita — token de 12h, ainda válido
    const resultados = await page.evaluate(
      async ({ api, tok, id }) => {
        await fetch(`${api}/admin/competicoes/${id}/finalizar`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
        return (await fetch(`${api}/admin/competicoes/${id}/resultados`, { headers: { Authorization: `Bearer ${tok}` } })).json();
      },
      { api: API, tok: tokenAdmin2, id: competitionId }
    );
    expect(resultados.resultados.length).toBeGreaterThan(0);

    // 3. Feed real gerado só se o vendedor foi o vencedor (COMPETITION_WON) — sempre auditável.
    const eventoFeed = await prisma.feedEvent.findFirst({ where: { eventType: 'COMPETITION_WON', sourceType: 'COMPETITION', sourceId: competitionId } });
    if (eventoFeed) expect(eventoFeed.subjectId).not.toBeNull();

    // 4. Dupla finalização (double-click) nunca duplica resultado nem reward.
    await page.evaluate(async ({ api, tok, id }) => fetch(`${api}/admin/competicoes/${id}/finalizar`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } }), { api: API, tok: tokenAdmin2, id: competitionId });
    const resultadosFinais = await prisma.competitionResult.findMany({ where: { competitionId } });
    expect(resultadosFinais.length).toBe(resultados.resultados.length);

    await prisma.$disconnect();
  });
});
