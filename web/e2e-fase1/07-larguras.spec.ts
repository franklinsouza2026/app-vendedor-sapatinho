/**
 * Onda 7 — mobile real: 320, 390 e 430 px. Nenhuma tela da vendedora pode
 * ter rolagem horizontal; a navegação inferior fica visível.
 */
import { expect, test } from '@playwright/test';
import { entrarPelaTela, PESSOAS } from './apoio';

const ROTAS = ['/inicio', '/desempenho', '/desempenho?aba=indicadores', '/ranking', '/ranking?escopo=geral', '/ranking?escopo=lojas', '/desafios', '/desafios?aba=competicoes', '/desafios?aba=campanha', '/progresso', '/moedas', '/conquistas', '/recordes', '/feed', '/reconhecimentos', '/perfil', '/perfil/senha'];

for (const largura of [320, 390, 430]) {
  test(`${largura}px — telas da vendedora sem rolagem horizontal`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await entrarPelaTela(page, PESSOAS.caio);
    for (const rota of ROTAS) {
      await page.goto(rota);
      await expect(page.getByRole('navigation', { name: 'Navegação principal' }), `${rota}: ${erros.join(' | ')}`).toBeVisible();
      const texto = await page.locator('body').innerText();
      expect(texto, `${rota}: texto de protótipo na tela real`).not.toMatch(/protótipo|ilustrativ|backend|decisão pendente|será decidid|🧪|\(demo\)|simulad/i);
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso, `${rota} em ${largura}px`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
}
