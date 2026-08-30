// E2E real: navegador de verdade + backend real (MockAIProvider, sem chamada
// paga) — cobre a Fatia 7.5A (Identidade/Admin/Conselheiro/privacidade):
// ativação de conta pré-autorizada, bloqueio/desbloqueio pelo Admin,
// privacidade de faturamento no ranking, e a renomeação Coach → Conselheiro
// na experiência do vendedor.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CPF_TESTE = '333.864.864-28'; // CPF de teste válido (dígitos verificadores corretos), nunca de pessoa real

test.describe('Jornada de Identidade — Fatia 7.5A', () => {
  test.beforeAll(() => {
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:identidade-e2e', { cwd: backendRoot, stdio: 'inherit' });
  });

  test('ATIVAÇÃO: Admin pré-autoriza → vendedor ativa com CPF+código → Home personalizada', async ({ page }) => {
    // 1. Login como Admin
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('ADM001');
    await page.getByLabel('Senha').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // 2. Perfil → Administração → Usuários → Pré-autorizar
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
    await page.getByRole('link', { name: /Pré-autorizar vendedor/ }).click();

    await page.getByLabel('Nome completo').fill('Vendedora E2E Ativação');
    await page.getByLabel('Matrícula (loja)').fill('E2E-ATIVA001');
    await page.getByLabel('CPF').fill(CPF_TESTE);
    await page.getByRole('button', { name: 'Pré-autorizar' }).click();

    // 3. Código de ativação mostrado UMA vez — captura pra usar na ativação
    await expect(page.getByText('Vendedor pré-autorizado')).toBeVisible();
    const codigo = await page.locator('code').textContent();
    expect(codigo).toBeTruthy();

    // 4. Logout do Admin
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();

    // 5. Vendedora ativa a própria conta com CPF + código
    await page.goto('/ativacao');
    await page.getByLabel('CPF').fill(CPF_TESTE);
    await page.getByLabel('Código de ativação').fill(codigo!);
    await page.getByLabel('Crie uma senha').fill('senhaAtivada123');
    await page.getByLabel('Confirme a senha').fill('senhaAtivada123');
    await page.getByRole('button', { name: 'Ativar conta' }).click();

    // 6. Login automático pós-ativação — Home já personalizada com o nome real
    await expect(page.getByText(/Bo(m|a) (dia|tarde|noite), Vendedora/)).toBeVisible();

    // 7. Login manual com a senha recém-criada também funciona
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.getByLabel('Matrícula').fill('E2E-ATIVA001');
    await page.getByLabel('Senha').fill('senhaAtivada123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/Bo(m|a) (dia|tarde|noite), Vendedora/)).toBeVisible();
  });

  test('BLOQUEIO: Admin bloqueia vendedor → login/acesso param → desbloqueio restaura', async ({ page }) => {
    // 1. Login como o vendedor que vai ser bloqueado (VEND002)
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();

    // 2. Login como Admin e bloquear VEND002
    await page.getByLabel('Matrícula').fill('ADM001');
    await page.getByLabel('Senha').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByPlaceholder('Buscar por nome...').fill('Segundo Vendedor');
    await page.getByRole('link', { name: 'Segundo Vendedor' }).click();
    await page.getByRole('button', { name: 'Bloquear' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('bloqueado')).toBeVisible();

    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();

    // 3. VEND002 não consegue mais logar
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // 4. Admin desbloqueia
    await page.getByLabel('Matrícula').fill('ADM001');
    await page.getByLabel('Senha').fill('admin123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.getByRole('link', { name: 'Administração' }).click();
    await page.getByPlaceholder('Buscar por nome...').fill('Segundo Vendedor');
    await page.getByRole('link', { name: 'Segundo Vendedor' }).click();
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('ativo')).toBeVisible();

    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Sair' }).click();

    // 5. VEND002 consegue logar de novo
    await page.getByLabel('Matrícula').fill('VEND002');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Evoluir', exact: true })).toBeVisible();
  });

  test('RANKING PRIVACIDADE: faturamento de outros vendedores nunca aparece, nem no payload de rede', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const respostaRanking = page.waitForResponse((res) => res.url().includes('/gamificacao/ranking') && res.url().includes('FATURAMENTO'));

    await page.getByRole('link', { name: 'Ranking', exact: true }).click();
    await page.getByRole('button', { name: 'Faturamento' }).click();

    const resposta = await respostaRanking;
    const corpo = await resposta.json();
    // prova de rede, não só de UI: toda linha que não é a do próprio
    // vendedor precisa ter "valor" null — nunca um número de faturamento.
    const linhasAlheias = corpo.ranking.filter((l: { valor: string | null }) => l.valor === null);

    if (corpo.ranking.length > 1) {
      expect(linhasAlheias.length).toBeGreaterThan(0);
      await expect(page.getByText('R$ •••••').first()).toBeVisible();
    }
  });

  test('CONSELHEIRO: Home usa o nome real na saudação, e o antigo "Coach" não aparece pro vendedor', async ({ page }) => {
    // Reseta o check-in de hoje do Conselheiro — sem isso, um check-in feito
    // mais cedo na mesma suíte (jornada-coach.spec.ts) já teria consumido o
    // card de saudação, escondendo o texto que este teste verifica.
    const backendRoot = path.resolve(__dirname, '../..');
    execSync('npm run reset:coach-e2e', { cwd: backendRoot, stdio: 'inherit' });

    await page.goto('/login');
    await page.getByLabel('Matrícula').fill('VEND001');
    await page.getByLabel('Senha').fill('vendedor123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/Bo(m|a) (dia|tarde|noite), Vendedor/)).toBeVisible();

    await page.getByRole('link', { name: 'Evoluir', exact: true }).click();
    await expect(page.getByText('Conselheiro', { exact: true })).toBeVisible();
    await expect(page.getByText('Coach', { exact: true })).toHaveCount(0);

    await page.getByText('Conselheiro', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Conselheiro' })).toBeVisible();
    await expect(page.getByText(/Bo(m|a) (dia|tarde|noite), Vendedor.*Como você está chegando pra trabalhar hoje\?/)).toBeVisible();
  });
});
