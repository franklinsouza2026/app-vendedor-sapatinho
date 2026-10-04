/**
 * E20 (empresa A não vê B), E21 (trocar ID não dá acesso a outro escopo),
 * E22 (bloqueado perde acesso) e E23 (senha alterada derruba as sessões).
 */
import { expect, test } from '@playwright/test';
import { API, cliente, IDS, painel, PESSOAS, SENHA_VENDEDORA, token, vendedorId } from './apoio';

test.describe.configure({ mode: 'serial' });

/** CPF válido determinístico (dígitos verificadores calculados). */
function cpfValido(base9: string): string {
  const d = base9.split('').map(Number);
  const dv = (n: number[]) => {
    const s = n.reduce((a, x, i) => a + x * (n.length + 1 - i), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

test('E20 — empresa A e empresa B não enxergam nada uma da outra', async ({ request }) => {
  const tkB = await token(request, PESSOAS.adminB);
  const adminB = cliente(request, tkB);
  const estadoB = await adminB.json('get', '/admin/fase1/estado');
  expect(estadoB.vendedores.map((v: { matricula: string }) => v.matricula).sort()).toEqual([PESSOAS.beto.matricula]);
  expect(estadoB.lojas.map((l: { id: string }) => l.id)).toEqual([IDS.lojaB1]);
  expect(JSON.stringify(estadoB)).not.toContain('Ana Recife');

  const beto = await painel(request, PESSOAS.beto);
  expect(beto.pessoas.every((p: { id: string; lojaId: string }) => p.lojaId === IDS.lojaB1)).toBe(true);
  expect(JSON.stringify(beto)).not.toMatch(/Ana Recife|Caio Caruaru|E2E Empresa A/);

  // login mostra só lojas da empresa pedida; sem empresa, com várias empresas, não lista nada
  expect((await (await request.get(`${API}/lojas`)).json()).lojas ?? []).toEqual([]);
  const lojasB = (await (await request.get(`${API}/lojas?empresa=${IDS.empresaB}`)).json()).lojas;
  expect(lojasB.map((l: { id: string }) => l.id)).toEqual([IDS.lojaB1]);
});

test('E21 — trocar IDs na requisição não abre outro escopo', async ({ request }) => {
  const tkA = await token(request, PESSOAS.adminA);
  const tkB = await token(request, PESSOAS.adminB);
  const idAna = await vendedorId(request, tkA, PESSOAS.ana.matricula);
  const adminB = cliente(request, tkB);
  const adminA = cliente(request, tkA);
  const mes = new Date().toISOString().slice(0, 7);

  // Admin B mirando dados da empresa A
  expect([403, 404]).toContain((await adminB.put(`/admin/fase1/metas/${mes}/vendedores/${idAna}`, { mensal: 1, diasPrevistos: 1 })).status());
  expect([403, 404]).toContain((await adminB.get(`/admin/vendedores/${idAna}`)).status());
  expect([403, 404]).toContain((await adminB.post(`/admin/fase1/integracoes/${IDS.integracaoA}/sincronizar`)).status());
  expect([403, 404]).toContain((await adminB.post(`/admin/fase1/reconhecimentos`, { vendedorId: idAna, motivo: 'RESULTADO', titulo: 'Intruso', mensagem: 'não deveria chegar' })).status());
  // Admin A mirando a loja/integração da B
  expect([403, 404]).toContain((await adminA.post('/admin/vendedores', { lojaId: IDS.lojaB1, matriculaErp: 'X', nome: 'X', cpf: cpfValido('529982247') })).status());
  expect([403, 404]).toContain((await adminA.put(`/admin/fase1/integracoes/${IDS.integracaoA}/lojas/${IDS.lojaB1}`, { codigoExterno: 'E2E-B1' })).status());

  // Vendedora tentando área do Admin ou dados de outra pessoa
  const ana = cliente(request, await token(request, PESSOAS.ana));
  expect((await ana.get('/admin/fase1/estado')).status()).toBe(403);
  expect((await ana.put(`/admin/fase1/metas/${mes}/vendedores/${idAna}`, { mensal: 999999, diasPrevistos: 1 })).status()).toBe(403);
  const idBia = await vendedorId(request, tkA, PESSOAS.bia.matricula);
  const d = await ana.json('get', `/app/painel?vendedorId=${idBia}&empresaId=${IDS.empresaB}`);
  expect(d.vendedor.id).toBe(idAna);

  // token adulterado (payload trocado, assinatura velha) é recusado
  const [h, p, s] = (await token(request, PESSOAS.ana)).split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.papel = 'ADMIN';
  payload.empresaId = IDS.empresaB;
  const forjado = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.');
  expect((await request.get(`${API}/admin/fase1/estado`, { headers: { authorization: `Bearer ${forjado}` } })).status()).toBe(401);
});

test('E22 — vendedor bloqueado perde o acesso na hora (token antigo morre)', async ({ request }) => {
  const tkA = await token(request, PESSOAS.adminA);
  const admin = cliente(request, tkA);
  const cpf = cpfValido('111444777');
  const criado = await admin.json('post', '/admin/vendedores', { lojaId: IDS.lojaA2, matriculaErp: 'E2E-GABI', nome: 'Gabi Bloqueio', cpf });
  const at = await request.post(`${API}/auth/ativacao`, { data: { lojaId: IDS.lojaA2, cpf, token: criado.tokenAtivacao, senha: SENHA_VENDEDORA } });
  expect(at.status()).toBe(200);
  const gabi = { matricula: 'E2E-GABI', loja: IDS.lojaA2 };
  const tkGabi = await token(request, gabi);
  expect((await cliente(request, tkGabi).get('/app/painel')).status()).toBe(200);

  await admin.json('post', `/admin/vendedores/${criado.id}/bloquear`, { motivo: 'Teste E2E de bloqueio' });
  expect((await cliente(request, tkGabi).get('/app/painel')).status()).toBe(401);
  const login = await request.post(`${API}/auth/login`, { data: { lojaId: gabi.loja, matriculaErp: gabi.matricula, senha: SENHA_VENDEDORA } });
  expect(login.status()).not.toBe(200);

  await admin.json('post', `/admin/vendedores/${criado.id}/desbloquear`, { motivo: 'Fim do teste' });
  expect((await cliente(request, tkGabi).get('/app/painel')).status()).toBe(401); // sessão antiga continua morta
  expect((await cliente(request, await token(request, gabi)).get('/app/painel')).status()).toBe(200);
});

test('E23 — trocar a senha derruba todas as sessões anteriores', async ({ request }) => {
  const tkVelho = await token(request, PESSOAS.bia);
  const outroDispositivo = await token(request, PESSOAS.bia);
  const nova = 'bia-senha-nova-456';
  const r = await cliente(request, tkVelho).post('/auth/senha', { senhaAtual: SENHA_VENDEDORA, novaSenha: nova });
  expect(r.ok()).toBeTruthy();
  for (const tk of [tkVelho, outroDispositivo]) expect((await cliente(request, tk).get('/app/painel')).status()).toBe(401);
  const velha = await request.post(`${API}/auth/login`, { data: { lojaId: PESSOAS.bia.loja, matriculaErp: PESSOAS.bia.matricula, senha: SENHA_VENDEDORA } });
  expect(velha.status()).toBe(401);
  expect((await cliente(request, await token(request, PESSOAS.bia, nova)).get('/app/painel')).status()).toBe(200);
});
