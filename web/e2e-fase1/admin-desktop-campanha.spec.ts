/**
 * Teste A (rodada pré-Linx) — campanha criada INTEIRA pela interface do Admin:
 * as 10 etapas do assistente homologado → checagem do servidor → publicação →
 * persistência → reabertura → regras travadas → cancelamento. Mais: campo
 * obrigatório, referência de outra empresa, saída do assistente sem salvar e
 * rascunho salvo uma única vez.
 */
import { expect, test, type Page } from '@playwright/test';
import { API, cliente, entrarPelaTela, IDS, PESSOAS, token } from './apoio';

test.use({ timezoneId: 'America/Sao_Paulo' });
test.describe.configure({ mode: 'serial' });

const NOME = 'Primavera E2E';
let tkAdmin: string;
let campanhaId = '';

function hojeLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function emDiasLocal(n: number) {
  const d = new Date(`${hojeLocal()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function etapa(page: Page, n: number, nome: string) {
  await page.getByRole('button', { name: `${n}. ${nome}` }).click();
  await expect(page.getByRole('heading', { name: `${n}. ${nome}` })).toBeVisible();
}
async function campanhasDoServidor(request: Parameters<typeof cliente>[0]) {
  return (await cliente(request, tkAdmin).json('get', '/admin/fase1/estado')).campanhas as { id: string; nome: string; status: string; inicio: string; fim: string; lojas: unknown; objetivo: string; regras: string; descricao: string; frentes: { mecanismo: string; refId: string | null; premioId: string | null; titulo: string }[] }[];
}

test.beforeAll(async ({ request }) => {
  tkAdmin = await token(request, PESSOAS.adminA);
  const admin = cliente(request, tkAdmin);
  await admin.json('post', '/admin/fase1/premios', { nome: 'Vale-compras Primavera', tipo: 'EMPRESARIAL', xp: 0, moedas: 0, comBadge: false, categoria: 'VALE', descricao: 'Vale de R$ 200 entregue pela gerência' });
  await admin.json('post', '/admin/fase1/competicoes', {
    nome: 'Corrida da Primavera', tipo: 'VENDEDOR', formato: 'ESPECIAL', metrica: 'QTD_VENDAS', categoria: null, escopo: 'TODAS', lojas: 'TODAS', regra: 'Mais vendas no período.',
    inicio: new Date(Date.now() - 3600_000).toISOString(), fim: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    premioIds: [(await admin.json('get', '/admin/fase1/estado')).premios.find((p: { nome: string }) => p.nome === 'Vale-compras Primavera').id],
  });
});

test('assistente: campo obrigatório bloqueia a publicação e diz o que falta', async ({ page }) => {
  await entrarPelaTela(page, PESSOAS.adminA);
  await page.goto('/admin/campanhas/nova');
  await expect(page.getByRole('heading', { name: 'Nova campanha', level: 1 })).toBeVisible();
  await etapa(page, 10, 'Publicação');
  const checagem = page.getByRole('status').filter({ hasText: 'Não é possível publicar ainda' });
  await expect(checagem).toBeVisible();
  await expect(checagem).toContainText('Dê um nome à campanha.');
  await expect(checagem).toContainText('Inclua ao menos uma frente.');
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toBeDisabled();
});

test('sair do assistente sem salvar não cria nada; salvar rascunho cria uma única campanha', async ({ page, request }) => {
  const antes = (await campanhasDoServidor(request)).length;
  await entrarPelaTela(page, PESSOAS.adminA);
  await page.goto('/admin/campanhas/nova');
  await page.getByLabel('Nome da campanha').fill('Rascunho abandonado');
  await page.getByRole('link', { name: '← Campanhas' }).click();
  await expect(page).toHaveURL(/\/admin\/campanhas$/);
  expect((await campanhasDoServidor(request)).length).toBe(antes);

  await page.goto('/admin/campanhas/nova');
  await page.getByLabel('Nome da campanha').fill('Rascunho guardado');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page).toHaveURL(/\/admin\/campanhas\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Rascunho salvo.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click(); // salvar de novo = atualizar, não duplicar
  await expect(page.getByText('Rascunho salvo.')).toBeVisible();
  const depois = await campanhasDoServidor(request);
  expect(depois.length).toBe(antes + 1);
  expect(depois.filter((c) => c.nome === 'Rascunho guardado')).toHaveLength(1);
  expect(depois.find((c) => c.nome === 'Rascunho guardado')!.status).toBe('RASCUNHO');
});

test('jornada principal: 10 etapas → checagem verde → publicar → persistido → reabrir → regras travadas', async ({ page, request }) => {
  await entrarPelaTela(page, PESSOAS.adminA);
  await page.goto('/admin/campanhas/nova');

  // 1. Identidade
  await page.getByLabel('Nome da campanha').fill(NOME);
  await page.getByLabel(/^Descrição para o vendedor/).fill('Quem vender mais na primavera leva vale-compras.');
  // 2. Período (começa hoje → publica ATIVA)
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByRole('heading', { name: '2. Período' })).toBeVisible();
  await page.getByLabel('Início').fill(hojeLocal());
  await page.getByLabel('Fim').fill(emDiasLocal(5));
  // 3. Participantes: só A1 Recife
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await page.getByRole('checkbox', { name: 'Todas as lojas' }).uncheck();
  await page.getByRole('checkbox', { name: 'A1 Recife' }).check();
  // 4. Objetivo
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await page.getByLabel(/^Objetivo de negócio/).fill('Girar a coleção de primavera.');
  // 5. Mecânica: frente "Top vendedor" ligada à competição
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await page.getByRole('button', { name: '+ 🏆 Top vendedor' }).click();
  await page.getByLabel('Competição de Top vendedor').selectOption({ label: 'Corrida da Primavera (ativa)' });
  // 6. Recompensas
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await page.locator('main select').first().selectOption({ label: 'Vale-compras Primavera' });
  // 7. Premiação (resumo)
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByText('Empresarial · Vale-compras Primavera')).toBeVisible();
  // 8. Regras
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await page.getByLabel(/^Regras \(o que vale/).fill('Vale o número de vendas finalizadas no período.');
  // 9. Preview: o que a vendedora vê
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByText('👁 Como a vendedora vê')).toBeVisible();
  await expect(page.getByText('Corrida da Primavera').last()).toBeVisible();
  // 10. Publicação: checagem do SERVIDOR verde
  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pronto para publicar' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByText('Campanha publicada.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/campanhas\/[0-9a-f-]{36}$/);
  campanhaId = page.url().split('/').pop()!;

  // persistido no servidor exatamente como preenchido
  const c = (await campanhasDoServidor(request)).find((x) => x.id === campanhaId)!;
  expect(c.status).toBe('ATIVA');
  expect(c.nome).toBe(NOME);
  expect(c.lojas).toEqual([IDS.lojaA1]);
  expect(c.objetivo).toBe('Girar a coleção de primavera.');
  expect(c.frentes).toHaveLength(1);
  expect(c.frentes[0].mecanismo).toBe('COMPETICAO');
  expect(c.frentes[0].refId).toBeTruthy();
  expect(c.frentes[0].premioId).toBeTruthy();

  // reabrir (página nova): dados conferem e as regras críticas estão travadas
  await page.goto(`/admin/campanhas/${campanhaId}`);
  await expect(page.getByRole('heading', { name: NOME, level: 1 })).toBeVisible();
  await expect(page.getByText('regras críticas bloqueadas')).toBeVisible();
  await expect(page.getByLabel('Nome da campanha')).toHaveValue(NOME);
  await expect(page.getByLabel('Nome da campanha')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publicar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Salvar/ })).toHaveCount(0);

  // a vendedora da loja participante vê; a de fora não
  const painelDe = async (p: typeof PESSOAS.ana) => cliente(request, await token(request, p)).json('get', '/app/painel');
  expect((await painelDe(PESSOAS.ana)).campanhas.some((x: { id: string }) => x.id === campanhaId)).toBe(true);
  expect((await painelDe(PESSOAS.caio)).campanhas.some((x: { id: string }) => x.id === campanhaId)).toBe(false);
});

test('regra proibida depois do início: o servidor recusa mesmo chamando a API direto', async ({ request }) => {
  const c = (await campanhasDoServidor(request)).find((x) => x.id === campanhaId)!;
  const r = await request.put(`${API}/admin/fase1/campanhas/${campanhaId}`, {
    headers: { authorization: `Bearer ${tkAdmin}` },
    data: { nome: c.nome, descricao: c.descricao, objetivo: c.objetivo, regras: c.regras, inicio: c.inicio, fim: c.fim, lojas: 'TODAS', frentes: c.frentes.map((f, i) => ({ id: `f${i}`, icone: '🏆', titulo: f.titulo, mecanismo: f.mecanismo, refId: f.refId, premioId: f.premioId })) },
  });
  expect(r.status()).toBe(409);
  expect((await campanhasDoServidor(request)).find((x) => x.id === campanhaId)!.lojas).toEqual([IDS.lojaA1]);
});

test('referência de outra empresa é recusada (prêmio e loja da empresa B)', async ({ request }) => {
  const tkB = await token(request, PESSOAS.adminB);
  const premioB = await cliente(request, tkB).json('post', '/admin/fase1/premios', { nome: 'Prêmio da B', tipo: 'DIGITAL', xp: 5, moedas: 0, comBadge: false, categoria: null, descricao: '' });
  const base = { nome: 'Invasora', descricao: 'd', objetivo: 'o', regras: 'r', inicio: new Date().toISOString(), fim: new Date(Date.now() + 86_400_000).toISOString() };
  const admin = cliente(request, tkAdmin);
  expect((await admin.post('/admin/fase1/campanhas', { ...base, lojas: 'TODAS', frentes: [{ id: 'f', icone: '🎯', titulo: 'Meta', mecanismo: 'META_MES', refId: null, premioId: premioB.id }] })).status()).toBe(400);
  expect((await admin.post('/admin/fase1/campanhas', { ...base, lojas: [IDS.lojaB1], frentes: [] })).status()).toBe(400);
  expect((await campanhasDoServidor(request)).some((x) => x.nome === 'Invasora')).toBe(false);
});

test('ciclo de vida: cancelar pela tela exige motivo, some do app e o histórico fica', async ({ page, request }) => {
  await entrarPelaTela(page, PESSOAS.adminA);
  await page.goto(`/admin/campanhas/${campanhaId}`);
  await page.getByRole('button', { name: 'Cancelar campanha' }).click();
  const motivo = page.getByLabel(/^Motivo do cancelamento/);
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click(); // vazio: o formulário não envia
  await expect(motivo).toBeVisible();
  await motivo.fill('Coleção atrasou no fornecedor');
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByText(/Campanha cancelada/)).toBeVisible();
  const c = (await campanhasDoServidor(request)).find((x) => x.id === campanhaId)!;
  expect(c.status).toBe('CANCELADA');
  const painelAna = await cliente(request, await token(request, PESSOAS.ana)).json('get', '/app/painel');
  expect(painelAna.campanhas.some((x: { id: string }) => x.id === campanhaId)).toBe(false);
  await page.goto('/admin/campanhas');
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('heading', { name: NOME })).toBeVisible();
});
