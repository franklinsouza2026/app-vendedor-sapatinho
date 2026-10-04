/**
 * E24 — integração com erro/atrasada → Admin vê FALHA/ATENÇÃO e o vendedor vê
 *       aviso de dado desatualizado.
 * E25 — a experiência instalada (build de produção, manifest + service
 *       worker reais) abre a Fase 1, não o app antigo.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { DIR_ERP, PORTA_PWA, urlBancoE2E } from './ambiente';
import { cliente, entregar, IDS, painel, PESSOAS, sincronizar, token, venda } from './apoio';

test.describe.configure({ mode: 'serial' });

test('E24 — erro de integração vira FALHA; atraso vira ATENÇÃO/FALHA e aviso para o vendedor', async ({ request }) => {
  const tkB = await token(request, PESSOAS.adminB);
  const adminB = cliente(request, tkB);
  entregar(IDS.integracaoB, [venda(PESSOAS.beto, 200)]);
  await sincronizar(request, tkB, IDS.integracaoB);
  const saudeDe = async () => (await adminB.json('get', '/admin/fase1/saude')).integracoes.find((i: { id: string }) => i.id === IDS.integracaoB);
  expect((await saudeDe()).estado).toBe('OPERACIONAL');

  // ERP devolve lixo → execução com ERRO → FALHA
  entregar(IDS.integracaoB, { nao: 'é uma lista' } as unknown as unknown[], 'zz-quebrado');
  await sincronizar(request, tkB, IDS.integracaoB, 'ERRO');
  expect((await saudeDe()).estado).toBe('FALHA');
  expect((await adminB.json('get', '/admin/fase1/saude')).geral.estado).toBe('FALHA');

  // ERP volta → recuperado, mas o erro recente fica visível como ATENÇÃO
  rmSync(join(DIR_ERP, IDS.integracaoB, 'zz-quebrado.json'));
  await sincronizar(request, tkB, IDS.integracaoB);
  expect((await saudeDe()).estado).toBe('ATENCAO');

  // atraso: último sucesso há 2 h (simulado no banco do E2E) → ATENÇÃO e aviso ao vendedor
  const prisma = new PrismaClient({ datasources: { db: { url: urlBancoE2E() } } });
  try {
    const duasHoras = new Date(Date.now() - 2 * 3600_000);
    await prisma.integracao.update({ where: { id: IDS.integracaoB }, data: { ultimaSyncSucessoEm: duasHoras, ultimaSyncEm: duasHoras } });
    await prisma.integracaoExecucao.updateMany({ where: { integracaoId: IDS.integracaoB }, data: { iniciadaEm: duasHoras, finalizadaEm: duasHoras } });
  } finally {
    await prisma.$disconnect();
  }
  const atrasada = await saudeDe();
  expect(['ATENCAO', 'FALHA']).toContain(atrasada.estado);
  expect(atrasada.motivo).toMatch(/h|min/);
  expect((await painel(request, PESSOAS.beto)).status.desatualizado).toBe(true);
});

test('E25 — o app instalado (build de produção) abre a Fase 1', async ({ page, request }) => {
  const base = `http://localhost:${PORTA_PWA}`;
  const manifesto = await (await request.get(`${base}/manifest.webmanifest`)).json();
  expect(manifesto.start_url).toBe('/');
  expect(manifesto.display).toBe('standalone');

  await page.goto(`${base}/`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Vendedor IA' })).toBeVisible();
  // service worker do build registrado (instalável)
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 15_000 }).toBeGreaterThan(0);

  await page.getByLabel('Loja').selectOption(PESSOAS.ana.loja);
  await page.getByLabel('Matrícula').fill(PESSOAS.ana.matricula);
  await page.getByLabel('Senha').fill('e2e-vendedora-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveText([/Início/, /Desempenho/, /Ranking/, /Desafios/, /Perfil/]);
  await expect(page.getByText(/Conselheiro|Universidade|Simulador|Treinador/)).toHaveCount(0);

  // reabrir pelo start_url (como o ícone instalado faz) mantém a sessão e cai na Fase 1
  await page.goto(`${base}/`);
  await expect(page).toHaveURL(/\/inicio$/);
});
