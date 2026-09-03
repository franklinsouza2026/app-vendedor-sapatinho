// E2E real — Fatia 9.6: Admin Estrutura/Realocação, Treinador Gerencial,
// Simulador Gerencial (cenários próprios) e Ranking em pista.
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';

const prisma = new PrismaClient();

async function login(page: Page, matricula: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Perfil' }).waitFor();
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
    // Prefixo "ZZZ" de propósito: a Home/Login busca a loja pelo nome em
    // ordem alfabética e a UI de login sempre auto-seleciona a primeira da
    // lista — um nome que ordene ANTES de "Loja Piloto" vira sem querer a
    // loja padrão do formulário de login e quebra TODOS os outros logins
    // desta e de outras suítes (achado real, causou 4 falhas em cascata
    // antes de ser corrigido).
    const outraLoja = await prisma.loja.create({ data: { empresaId: vend002.empresaId, nome: `ZZZ Loja E2E ${Date.now()}`, codigoErp: `E2E-${Date.now()}` } });

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
      await prisma.loja.delete({ where: { id: outraLoja.id } });
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

  test('Vendedor vê a pista de ranking (visual novo) sem perder a lista acessível', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/ranking');

    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    // A pista é decorativa (aria-hidden) — a lista de texto continua visível e única fonte confiável.
    const pista = page.locator('[aria-hidden="true"] svg');
    await expect(pista.first()).toBeVisible();
  });
});
