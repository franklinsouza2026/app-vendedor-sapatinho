/**
 * Onda 7 — mobile real: 320, 390 e 430 px. Nenhuma tela da vendedora pode
 * ter rolagem horizontal; a navegação inferior fica visível.
 */
import { expect, test } from '@playwright/test';
import { entrarPelaTela, PESSOAS } from './apoio';

const ROTAS = ['/inicio', '/desempenho', '/desempenho?aba=indicadores', '/ranking', '/ranking?escopo=geral', '/ranking?escopo=lojas', '/desafios', '/desafios?aba=competicoes', '/desafios?aba=campanha', '/progresso', '/moedas', '/conquistas', '/recordes', '/feed', '/reconhecimentos', '/perfil', '/perfil/senha'];

for (const largura of [320, 390, 430, 768, 820]) {
  test(`${largura}px — telas da vendedora sem rolagem horizontal`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await entrarPelaTela(page, PESSOAS.ana);
    // fecha celebrações pendentes (modal) antes de percorrer as telas
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < 5 && (await page.getByRole('dialog').count()); i++) {
      await page.getByRole('dialog').getByRole('button').last().click();
      await page.waitForTimeout(300);
    }
    for (const rota of ROTAS) {
      await page.goto(rota);
      await expect(page.getByRole('navigation', { name: 'Navegação principal' }), `${rota}: ${erros.join(' | ')}`).toBeVisible();
      const texto = await page.locator('body').innerText();
      expect(texto, `${rota}: texto de protótipo na tela real`).not.toMatch(/protótipo|ilustrativ|backend|decisão pendente|será decidid|🧪|\(demo\)|simulad/i);
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso, `${rota} em ${largura}px`).toBeLessThanOrEqual(0);
      // nada vazando para fora da tela (cards, tabelas, textos longos)
      const vazando = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('[class*="overflow-x-auto"]'); }).map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 40)}`).slice(0, 3));
      expect(vazando, `${rota} em ${largura}px: elementos fora da tela`).toEqual([]);
      // áreas de toque da navegação principal ≥ 44 px
      const alvos = await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link').evaluateAll((ls) => ls.map((l) => Math.min(l.getBoundingClientRect().width, l.getBoundingClientRect().height)));
      expect(Math.min(...alvos), `${rota} em ${largura}px: área de toque`).toBeGreaterThanOrEqual(44);
      if (largura >= 768 && ['/inicio', '/desafios', '/desafios?aba=campanha', '/ranking', '/recordes', '/moedas'].includes(rota)) {
        await page.screenshot({ path: `test-results/tablet/${largura}${rota.replace(/[/?=]/g, '_')}.png`, fullPage: true });
      }
    }
    await ctx.close();
  });
}
