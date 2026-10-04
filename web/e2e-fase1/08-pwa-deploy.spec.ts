/**
 * Testes C, D e E (rodada pré-Linx) — PWA do BUILD DE PRODUÇÃO (service worker
 * e manifest reais), servido por um servidor estático próprio em que dá para
 * "fazer deploy" da versão A para a B na MESMA origem:
 *   C  instalação/abertura, login, sessão, navegação, reload, fechar e reabrir;
 *   D  atualização: o app não fica preso no bundle antigo e a sessão sobrevive;
 *      sessão aberta durante o deploy não quebra ao abrir área carregada sob demanda;
 *   E  offline: avisa, não inventa dado nem duplica ação; volta sozinho.
 */
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PORTA_PWA_DEPLOY, RAIZ } from './ambiente';
import { cliente, PESSOAS, SENHA_ADMIN, SENHA_VENDEDORA, token, vendedorId } from './apoio';

test.describe.configure({ mode: 'serial' });

const BASE = `http://localhost:${PORTA_PWA_DEPLOY}`;
const DIR = join(RAIZ, '.e2e', 'pwa-deploy');
const ORIGEM = join(RAIZ, 'web', 'dist-e2e');
let versao: 'A' | 'B' = 'A';
let servidor: Server;
const requisicoesApi: string[] = [];

const TIPOS: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Versão B = o mesmo build com bundles renomeados (como um deploy real faria) e index marcado. */
function prepararVersoes() {
  rmSync(DIR, { recursive: true, force: true });
  cpSync(ORIGEM, join(DIR, 'A'), { recursive: true });
  cpSync(ORIGEM, join(DIR, 'B'), { recursive: true });
  const b = join(DIR, 'B');
  const assets = readdirSync(join(b, 'assets'));
  const renomear = assets.filter((a) => a.endsWith('.js')).map((a) => [a, a.replace(/\.js$/, 'b.js')] as const);
  const arquivosTexto = [...assets.filter((a) => a.endsWith('.js')).map((a) => join(b, 'assets', a)), join(b, 'index.html'), join(b, 'sw.js')];
  for (const f of arquivosTexto) {
    let t = readFileSync(f, 'utf8');
    for (const [de, para] of renomear) t = t.split(de).join(para);
    if (f.endsWith('index.html')) t = t.replace('<head>', '<head>\n    <meta name="versao-app" content="B" />');
    if (f.endsWith('sw.js')) t = t.replace(/(url:"index\.html",revision:")[^"]+"/, '$1versao-b"');
    writeFileSync(f, t);
  }
  for (const [de, para] of renomear) renameSync(join(b, 'assets', de), join(b, 'assets', para));
}

function subirServidor() {
  servidor = createServer((req, res) => {
    const caminho = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let arquivo = join(DIR, versao, caminho);
    if (caminho === '/' || !extname(caminho) || !existsSync(arquivo)) {
      if (extname(caminho) && caminho !== '/') {
        res.writeHead(404).end('não encontrado');
        return;
      }
      arquivo = join(DIR, versao, 'index.html'); // fallback de SPA, como o nginx
    }
    const semCache = /\/(sw\.js|index\.html|registerSW\.js|manifest\.webmanifest)$/.test(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'cache-control': semCache ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(readFileSync(arquivo));
  });
  return new Promise<void>((r) => servidor.listen(PORTA_PWA_DEPLOY, r));
}

async function swControlando(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
}
const versaoNaTela = (page: Page) => page.evaluate(() => document.querySelector('meta[name="versao-app"]')?.getAttribute('content') ?? 'A');

async function entrar(page: Page, p: { matricula: string; loja: string }, senha: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Loja').selectOption(p.loja);
  await page.getByLabel('Matrícula').fill(p.matricula);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeAll(async () => {
  prepararVersoes();
  await subirServidor();
});
test.afterAll(async () => {
  await new Promise((r) => servidor.close(r));
});

test('C — app instalado: manifest/ícones válidos, SW controla, login, sessão sobrevive a reload e a fechar/reabrir', async ({ browser, request }) => {
  const manifesto = await (await request.get(`${BASE}/manifest.webmanifest`)).json();
  expect(manifesto).toMatchObject({ start_url: '/', display: 'standalone', name: expect.stringContaining('Vendedor IA') });
  for (const tamanho of ['192x192', '512x512']) {
    const icone = manifesto.icons.find((i: { sizes: string }) => i.sizes === tamanho);
    expect(icone, `ícone ${tamanho}`).toBeTruthy();
    const r = await request.get(`${BASE}${icone.src}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }
  expect(manifesto.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('request', (r) => r.url().includes(':3020/') && requisicoesApi.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto(`${BASE}/`); // start_url, como o ícone instalado abre
  await expect(page).toHaveURL(/\/login$/);
  await swControlando(page);
  await entrar(page, PESSOAS.ana, SENHA_VENDEDORA);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole('region', { name: 'Meta de hoje' })).toBeVisible();
  await page.getByRole('link', { name: /Ranking/ }).click();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  const estado = await ctx.storageState();
  await page.close(); // "fechar o app"

  const reaberto = await ctx.newPage();
  await reaberto.goto(`${BASE}/`); // reabrir pelo ícone
  await expect(reaberto).toHaveURL(/\/inicio$/);
  await expect(reaberto.getByRole('region', { name: 'Meta de hoje' })).toBeVisible();
  const texto = await reaberto.locator('body').innerText();
  expect(texto).not.toMatch(/protótipo|ilustrativ|🧪|\(demo\)|Conselheiro|Universidade|Simulador|Treinador/i);
  expect(estado.origins.some((o) => o.localStorage.some((i) => i.name === 'vendedor-ia:token'))).toBe(true);
  await ctx.close();
});

test('D — deploy da versão B: no máximo dois reloads e o app está na B, logado, sem ficar preso na A', async ({ browser }) => {
  versao = 'A';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await swControlando(page);
  await entrar(page, PESSOAS.ana, SENHA_VENDEDORA);
  expect(await versaoNaTela(page)).toBe('A');

  versao = 'B'; // deploy
  // o navegador confere o sw.js a cada navegação; com skipWaiting a B assume sozinha
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole('navigation', { name: 'Navegação principal' }).waitFor();
        return versaoNaTela(page);
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] }
    )
    .toBe('B');
  await expect(page).toHaveURL(/\/inicio$/); // sessão preservada
  await expect(page.getByRole('region', { name: 'Meta de hoje' })).toBeVisible();
  const caches = await page.evaluate(async () => {
    const nomes = await caches.keys();
    const urls = (await Promise.all(nomes.map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat();
    return urls.filter((u) => u.includes('/assets/'));
  });
  expect(caches.every((u) => /b\.js$|\.css$/.test(u)), `cache só com a versão nova: ${caches.join(', ')}`).toBe(true);
  await ctx.close();
});

test('D — Admin com a tela aberta durante o deploy não fica em branco ao entrar na área carregada sob demanda', async ({ browser }) => {
  versao = 'A';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${BASE}/login`);
  await swControlando(page);
  expect(await versaoNaTela(page)).toBe('A');

  versao = 'B'; // deploy enquanto a tela de login (bundle A) está aberta
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ''), { timeout: 15_000 }).toContain('sw.js');
  // B ativa (skipWaiting) e a precache passa a ter só a B: o chunk do Admin da A sumiu do cache e do servidor
  const chunkAdminA = readdirSync(join(DIR, 'A', 'assets')).find((a) => a.startsWith('AdminRotas-') && a.endsWith('.js'))!;
  const cacheAtual = () => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat().join(' '));
  await expect.poll(cacheAtual, { timeout: 20_000 }).toMatch(/AdminRotas-[^ ]*b\.js/);
  await expect.poll(cacheAtual, { timeout: 20_000, message: 'a B ativa e remove o chunk da A' }).not.toContain(chunkAdminA);
  expect(await versaoNaTela(page)).toBe('A'); // a página aberta ainda roda o bundle A

  await page.getByLabel('Loja').selectOption(PESSOAS.adminA.loja);
  await page.getByLabel('Matrícula').fill(PESSOAS.adminA.matricula);
  await page.getByLabel('Senha').fill(SENHA_ADMIN);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral', level: 1 })).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test('E — offline: avisa, mantém os últimos dados, não duplica acesso; volta sozinho', async ({ browser, request }) => {
  versao = 'B';
  const tkAdmin = await token(request, PESSOAS.adminA);
  const xpAntes = async () => (await cliente(request, await token(request, PESSOAS.ana)).json('get', '/app/painel')).xp.total as number;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await swControlando(page);
  await entrar(page, PESSOAS.ana, SENHA_VENDEDORA);
  const meta = page.getByRole('region', { name: 'Meta de hoje' });
  await expect(meta).toBeVisible();
  const realizadoAntes = (await meta.textContent()) ?? '';
  const xp0 = await xpAntes();
  const idAna = await vendedorId(request, tkAdmin, PESSOAS.ana.matricula);
  const acessosAna = async () => (await cliente(request, tkAdmin).json('get', '/admin/fase1/estado')).desempenho.find((d: { vendedorId: string }) => d.vendedorId === idAna).acessosNoMes as number;
  const acessos0 = await acessosAna();

  await ctx.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toBeVisible();
  await expect(meta).toHaveText(realizadoAntes); // nada inventado: mesmos números
  // navegar offline: as telas continuam com os últimos dados, sem quebrar
  await page.getByRole('link', { name: /Ranking/ }).click();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  // recarregar offline: o app abre pelo service worker, NÃO desloga e avisa — sem número falso
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);
  expect(await page.locator('body').innerText()).not.toMatch(/R\$\s?\d/);
  expect(await page.evaluate(() => localStorage.getItem('vendedor-ia:token'))).toBeTruthy();

  // rede volta: retoma sozinho, mesmos números, sem aviso
  await ctx.setOffline(false);
  // retoma sozinho na MESMA tela em que a vendedora estava (Ranking)
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: /Início/ }).click();
  await expect(page.getByRole('region', { name: 'Meta de hoje' })).toHaveText(realizadoAntes, { timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0);
  // nenhuma recompensa ou evento a mais por ter caído e voltado
  expect(await xpAntes()).toBe(xp0);
  // cair e voltar não gera rajada de acessos: no máximo a reabertura real (1 por sessão restaurada)
  expect((await acessosAna()) - acessos0).toBeLessThanOrEqual(1);
  await ctx.close();
});
