// Jornadas COMPLETAS da Fatia 9.7 (P0/P1).
//
// Regra nova da fatia: toda jornada precisa ser exercitada ponta a ponta, não
// só na abertura. A regressão do Simulador Gerencial passou verde na Fatia 9.6
// justamente porque o E2E só checava a listagem de cenários e parava ali.
import { PrismaClient } from '@prisma/client';
import { expect, Page, test } from '@playwright/test';
import { PREFIXO_E2E, SENHA_E2E, removerPessoaE2E } from './fixtures';

const prisma = new PrismaClient();

// Identificadores fixos desta suíte (nunca aleatórios — ver fixtures.ts).
const LOJA_NOVA = { nome: 'ZZZ Loja Jornada 97', codigoErp: `${PREFIXO_E2E}LOJA-J97` };
const GERENTE = { matricula: `${PREFIXO_E2E}GER-J97`, nome: 'Camila Rocha', cpf: '52998224725' };
const VENDEDOR = { matricula: `${PREFIXO_E2E}VEND-J97`, nome: 'Bruno Alves', cpf: '11144477735' };

/**
 * Encerra a sessão de forma determinística.
 *
 * Checar `page.url()` depois do goto não serve: o redirect de sessão é
 * client-side (React), então a URL ainda pode ser /login no instante da
 * checagem e mudar logo em seguida — corrida que deixava o teste flaky.
 * Limpar o token antes de navegar elimina a corrida na origem.
 */
async function sair(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
}

async function login(page: Page, matricula: string, senha: string) {
  await sair(page);
  await page.goto('/login');
  await page.getByLabel('Matrícula').fill(matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera a sessão assentar: sem isto, um `goto` logo em seguida corre contra
  // o POST de login e a tela seguinte carrega sem token.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('Jornada Fatia 9.7', () => {
  // Estado inicial conhecido: remove só o que ESTA suíte cria, pelos seus
  // identificadores fixos. Nunca toca em dado de seed nem de outro spec.
  test.beforeAll(async () => {
    for (const matricula of [GERENTE.matricula, VENDEDOR.matricula]) {
      await removerPessoaE2E(prisma, matricula);
    }
    await prisma.loja.deleteMany({ where: { codigoErp: LOJA_NOVA.codigoErp } });
  });

  test('ADMIN: cria loja → cria gerente → cria vendedor → cadastra meta → reemite acesso → estrutura reflete tudo', async ({ page }) => {
    await login(page, 'ADM001', 'admin123');

    // Landing por papel: o ADMIN cai no painel administrativo, nunca na Home
    // de vendedor (P1 desta fatia).
    await expect(page).toHaveURL(/\/admin\/usuarios/);

    // 1. CRIA LOJA ------------------------------------------------------
    await page.goto('/admin/estrutura');
    await page.getByRole('textbox', { name: /Nome/i }).fill(LOJA_NOVA.nome);
    await page.getByRole('textbox', { name: /Código no ERP/i }).fill(LOJA_NOVA.codigoErp);
    await page.getByRole('button', { name: 'Criar loja' }).click();
    await expect(page.getByText(LOJA_NOVA.nome)).toBeVisible();

    // 2. CRIA GERENTE na loja nova ---------------------------------------
    await page.goto('/admin/usuarios/novo');
    await page.getByRole('combobox', { name: 'Papel' }).selectOption('GERENTE');
    await page.getByRole('combobox', { name: /Loja/i }).selectOption({ label: LOJA_NOVA.nome });
    await page.getByLabel('Nome completo').fill(GERENTE.nome);
    await page.getByLabel('Matrícula (loja)').fill(GERENTE.matricula);
    await page.getByLabel('CPF').fill(GERENTE.cpf);
    await page.getByRole('button', { name: 'Pré-autorizar', exact: true }).click();

    await expect(page.getByText('Acesso pré-autorizado')).toBeVisible();
    await expect(page.getByText(/Gerente/)).toBeVisible();
    const tokenGerente = (await page.locator('code').innerText()).trim();
    expect(tokenGerente.length).toBeGreaterThan(20);

    // 3. CRIA VENDEDOR na Loja Piloto -------------------------------------
    await page.goto('/admin/usuarios/novo');
    await page.getByRole('combobox', { name: 'Papel' }).selectOption('VENDEDOR');
    await page.getByRole('combobox', { name: /Loja/i }).selectOption({ label: 'Loja Piloto' });
    await page.getByLabel('Nome completo').fill(VENDEDOR.nome);
    await page.getByLabel('Matrícula (loja)').fill(VENDEDOR.matricula);
    await page.getByLabel('CPF').fill(VENDEDOR.cpf);
    await page.getByRole('button', { name: 'Pré-autorizar', exact: true }).click();
    const tokenVendedor = (await page.locator('code').innerText()).trim();

    // O vendedor ativa a própria conta e escolhe a própria senha. Precisa
    // deslogar o Admin antes: /ativacao redireciona quem já tem sessão.
    await sair(page);
    await page.goto('/ativacao');
    await page.getByLabel('Loja').selectOption({ label: 'Loja Piloto' });
    await page.getByLabel('CPF').fill(VENDEDOR.cpf);
    await page.getByLabel('Código de ativação').fill(tokenVendedor);
    await page.getByLabel('Crie uma senha').fill(SENHA_E2E);
    await page.getByLabel('Confirme a senha').fill(SENHA_E2E);
    await page.getByRole('button', { name: 'Ativar conta' }).click();
    // Marco pós-login agnóstico de papel (Fatia 9.7): o ADMIN aterrissa no shell
  // administrativo, que não tem a bottom nav do vendedor — esperar por "Perfil"
  // só funcionava pra VENDEDOR/GERENTE.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

    // 4. ADMIN CADASTRA META pro vendedor ---------------------------------
    await login(page, 'ADM001', 'admin123');
    await page.goto('/admin/metas');
    await page.getByRole('combobox', { name: /Vendedor/i }).selectOption({ label: VENDEDOR.nome });
    await page.getByRole('spinbutton', { name: /Valor/i }).fill('1500');
    await page.getByRole('button', { name: 'Cadastrar meta' }).click();

    // Escopa na LINHA do vendedor: a tabela lista as metas de todo mundo.
    const linhaDaMeta = page.getByRole('row').filter({ hasText: VENDEDOR.nome });
    await expect(linhaDaMeta).toHaveCount(1);
    await expect(linhaDaMeta.getByRole('cell', { name: 'Faturamento' })).toBeVisible();
    await expect(linhaDaMeta.getByRole('cell', { name: 'Diária' })).toBeVisible();

    // 5. A META CHEGA DE VERDADE NO VENDEDOR (o elo que faltava no produto) --
    await login(page, VENDEDOR.matricula, SENHA_E2E);
    await expect(page.getByText('Meta hoje')).toBeVisible();
    // "de R$ 1.500,00" (o alvo) aparece junto com o realizado — escopa no texto exato.
    await expect(page.getByText('de R$ 1.500,00')).toBeVisible();

    // 6. ADMIN REEMITE ACESSO do vendedor ---------------------------------
    await login(page, 'ADM001', 'admin123');
    const criado = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: VENDEDOR.matricula } });
    await page.goto(`/admin/usuarios/${criado.id}`);
    await page.getByRole('button', { name: 'Reemitir acesso' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    const novoToken = (await page.locator('code').innerText()).trim();
    expect(novoToken).not.toBe(tokenVendedor);
    // A senha anterior deixou de valer — o backend zerou o hash.
    const aposReemissao = await prisma.vendedor.findUniqueOrThrow({ where: { id: criado.id } });
    expect(aposReemissao.senhaHash).toBeNull();
    expect(aposReemissao.status).toBe('PENDING_ACTIVATION');

    // 7. ESTRUTURA REFLETE OS VÍNCULOS ------------------------------------
    await page.goto('/admin/estrutura');
    await expect(page.getByText(LOJA_NOVA.nome)).toBeVisible();
    await expect(page.getByText(GERENTE.nome)).toBeVisible();
    await expect(page.getByText(VENDEDOR.nome)).toBeVisible();
  });

  test('SELLER: ranking não contém Admin nem Gerente, e é lista tradicional', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');
    await page.goto('/ranking');

    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();

    // Elegibilidade (P0): quem não vende não entra no ranking comercial.
    const nomesDeQuemNaoVende = ['Helena Costa', 'Paulo Santos'];
    for (const nome of nomesDeQuemNaoVende) {
      await expect(page.getByText(nome, { exact: true })).toHaveCount(0);
    }

    // Ranking tradicional: lista com filtros, sem a pista de corrida.
    await expect(page.getByRole('button', { name: 'Minha loja' })).toBeVisible();
    await expect(page.locator('[aria-hidden="true"] svg')).toHaveCount(0);
  });

  test('CROSS-SCOPE: vendedor não alcança tela de gerente nem rota de admin', async ({ page }) => {
    await login(page, 'VEND001', 'vendedor123');

    // Tela de gerente: redirecionado pra própria landing, não vê a Equipe.
    await page.goto('/equipe');
    await expect(page.getByRole('heading', { name: 'Minha Equipe' })).toHaveCount(0);

    // Rota de admin: idem.
    await page.goto('/admin/metas');
    await expect(page.getByRole('heading', { name: 'Metas' })).toHaveCount(0);

  });
});
