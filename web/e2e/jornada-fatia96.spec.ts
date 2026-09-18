// E2E real — Fatia 9.6: Admin Estrutura/Realocação, Treinador Gerencial,
// Simulador Gerencial (cenários próprios) e Ranking.
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

import { garantirLojaAuxiliarE2E } from './fixtures';

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

test.describe('Jornada Fatia 9.6', () => {
  // Conversa do Treinador persiste entre execuções contra o mesmo banco de
  // dev — sem resetar, uma 2ª rodada no mesmo dia encontraria a conversa já
  // com mensagens (mensagens.length > 0), escondendo as quick actions que o
  // teste abaixo depende (mesma lição de jornada-missoes.spec.ts).
  test.beforeAll(async () => {
    const gerente = await prisma.vendedor.findFirst({ where: { matriculaErp: 'GER001' } });
    if (!gerente) return;
    await prisma.trainerMessage.deleteMany({ where: { conversation: { vendedorId: gerente.id } } });
    await prisma.trainerConversation.deleteMany({ where: { vendedorId: gerente.id } });
  });

  test('Admin vê a Estrutura da Empresa e realoca um vendedor pra outra loja', async ({ page }) => {
    const vend002 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND002' } });
    const lojaOriginalId = vend002.lojaId;
    // Loja auxiliar de identidade ESTÁVEL (upsert — ver `fixtures.ts`, que
    // também documenta por que o nome dela começa com "ZZZ"). O `finally`
    // continua devolvendo o vendedor pra loja original; a loja em si é reusada
    // entre execuções em vez de criada e apagada.
    const outraLoja = await garantirLojaAuxiliarE2E(prisma, vend002.empresaId);

    try {
      await login(page, 'ADM001', 'admin123');
      await page.goto('/admin/estrutura');
      await expect(page.getByRole('heading', { name: 'Estrutura da Empresa' })).toBeVisible();
      await expect(page.getByText(vend002.nome)).toBeVisible();

      await page.goto(`/admin/usuarios/${vend002.id}`);
      await page.locator('select').selectOption(outraLoja.id);
      await page.getByRole('button', { name: 'Realocar' }).click();
      await expect(page.getByText('Realocado com sucesso ✓')).toBeVisible();

      const atualizado = await prisma.vendedor.findUniqueOrThrow({ where: { id: vend002.id } });
      expect(atualizado.lojaId).toBe(outraLoja.id);
    } finally {
      // Sempre limpa, mesmo se uma asserção falhar no meio — nunca deixa
      // uma loja/vínculo de teste vazando pra outras suítes E2E.
      await prisma.vendedor.update({ where: { id: vend002.id }, data: { lojaId: lojaOriginalId } });
    }
  });

  test('Gerente acessa o Treinador de Gestão (nunca vê objeções de venda)', async ({ page }) => {
    await login(page, 'GER001', 'gerente123');
    await page.goto('/treinador');

    await expect(page.getByRole('heading', { name: 'Treinador de Gestão' })).toBeVisible();
    await expect(page.getByText('A cliente disse...')).toHaveCount(0);

    // Sem `waitForResponse` de propósito: o Mock responde rápido o
    // suficiente pra a corrida entre o registro do listener e a resposta já
    // ter terminado (achado real) — a asserção no conteúdo renderizado já
    // prova que a chamada aconteceu e teve sucesso.
    await page.getByRole('button', { name: 'Como conduzo um 1:1?' }).click();
    await expect(page.getByText(/Pra um bom 1:1/)).toBeVisible();
  });

  test('Gerente vê cenários de Simulador de gestão de pessoas, nunca cenários de venda', async ({ page }) => {
    await login(page, 'GER001', 'gerente123');
    await page.goto('/simulador');

    await expect(page.getByText('Feedback sobre queda de performance')).toBeVisible();
    await expect(page.getByText('Cliente reservada')).toHaveCount(0);
  });

  // Fatia 9.7: a pista de corrida foi revertida por decisão do proprietário —
  // o ranking voltou ao modelo tradicional de lista. O motor nunca soube que a
  // pista existia, então a reversão foi só remoção da camada visual.
  test('Vendedor vê o ranking tradicional em lista, com filtros e sua posição', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/ranking');

    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minha loja' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rede toda' })).toBeVisible();
    await expect(page.getByText('Sua posição')).toBeVisible();
    // Nenhum resquício da pista decorativa.
    await expect(page.locator('[aria-hidden="true"] svg')).toHaveCount(0);
  });
});
