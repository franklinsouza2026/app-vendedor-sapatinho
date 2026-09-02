// E2E real: navegador + backend real (Fatia 9, seção 116-125). Cobre o
// caminho principal do gerente: Home (situação da loja) -> Equipe -> criar
// plano de ação -> criar e concluir 1:1 -> Pendências -> Reunião do Dia.
// Nunca mocka nada — sempre contra o backend real (Mock AI).
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

test.describe('Jornada Painel Gerencial', () => {
  test('Home do Gerente mostra a situação da loja (nunca a Home genérica de vendedor)', async ({ page }) => {
    await login(page, 'GER001', 'gerente123');
    await page.goto('/');

    await expect(page.getByText('Meta do mês (loja)')).toBeVisible();
    await expect(page.getByText('Meta hoje')).toHaveCount(0); // nunca a meta pessoal do vendedor
    await expect(page.getByRole('link', { name: /Minha Equipe/ })).toBeVisible();
  });

  test('Equipe mostra % de meta/PA/ticket por vendedor e permite abrir o detalhe', async ({ page }) => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    await login(page, 'GER001', 'gerente123');
    await page.goto('/equipe');
    await page.getByText(vend001.nome, { exact: true }).click();

    await expect(page.getByRole('heading', { name: vend001.nome })).toBeVisible();
    await expect(page.getByText('Alertas')).toBeVisible();
    await expect(page.getByText('Planos de ação')).toBeVisible();
    await expect(page.getByText('1:1', { exact: true })).toBeVisible();
  });

  test('Gerente cria plano de ação pra um vendedor da própria loja e conclui', async ({ page }) => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    await login(page, 'GER001', 'gerente123');
    await page.goto('/equipe');
    await page.getByText(vend001.nome, { exact: true }).click();

    const tituloUnico = `Foco E2E ${Date.now()}`;
    await page.getByPlaceholder('Título').fill(tituloUnico);
    const respostaCriacao = page.waitForResponse((r) => r.url().includes('/gerente/planos-de-acao') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Criar e ativar' }).click();
    expect((await respostaCriacao).status()).toBe(201);

    await expect(page.getByText(tituloUnico)).toBeVisible();

    const plano = await prisma.managerActionPlan.findFirstOrThrow({ where: { title: tituloUnico } });
    expect(plano.status).toBe('ACTIVE');
    expect(plano.subjectId).toBe(vend001.id);

    await page.getByRole('button', { name: 'Concluir plano' }).first().click();
    await expect(page.getByText('COMPLETED').first()).toBeVisible();
  });

  test('Gerente agenda e conclui um 1:1 com notas privadas (nunca visível ao vendedor)', async ({ page }) => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    await login(page, 'GER001', 'gerente123');
    await page.goto('/equipe');
    await page.getByText(vend001.nome, { exact: true }).click();

    const respostaCriacao = page.waitForResponse((r) => r.url().includes('/gerente/1a1') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Agendar novo 1:1' }).click();
    await respostaCriacao;

    // Espera a lista recarregar (GET refeito após o POST) antes de agir —
    // senão o clique pode cair num botão que está sendo desmontado/
    // remontado durante o re-fetch (race real observada contra o dev DB
    // compartilhado).
    await page.waitForResponse((r) => r.url().includes('/gerente/1a1?vendedorId=') && r.request().method() === 'GET');
    await page.getByRole('button', { name: 'concluir com notas' }).first().click();
    const notaUnica = `Nota privada E2E ${Date.now()}`;
    await page.getByPlaceholder('Pontos positivos').fill(notaUnica);
    const respostaConclusao = page.waitForResponse((r) => r.url().includes('/concluir') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Concluir 1:1' }).click();
    expect((await respostaConclusao).status()).toBe(204);

    const encontro = await prisma.oneOnOne.findFirstOrThrow({ where: { sellerId: vend001.id, pontosPositivos: notaUnica } });
    expect(encontro.status).toBe('COMPLETED');
    // Privacidade da nota (seção 27) é garantida no backend e já coberta por
    // teste de integração HTTP dedicado (nenhuma rota do vendedor expõe
    // OneOnOne) — não repetido aqui via UI pra não duplicar cobertura.
  });

  test('Pendências e Reunião do Dia carregam sem erro (funcionam com IA desligada por padrão)', async ({ page }) => {
    await login(page, 'GER001', 'gerente123');

    await page.goto('/gerente/pendencias');
    await expect(page.getByRole('heading', { name: 'Pendências' })).toBeVisible();

    await page.goto('/gerente/reuniao-do-dia');
    await expect(page.getByRole('heading', { name: 'Reunião do Dia' })).toBeVisible();
    await expect(page.getByText('Faturamento de ontem (loja)')).toBeVisible();
  });
});
