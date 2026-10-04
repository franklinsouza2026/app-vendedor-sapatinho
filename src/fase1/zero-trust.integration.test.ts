// Security Gate (Onda 9) — §22 ZERO TRUST: cada tentativa abaixo é feita de
// propósito e precisa falhar de forma segura (403/401/404, ou o dado do
// cliente é ignorado). Nada aqui confia em ID vindo do cliente.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../db';
import { env } from '../config';
import { tokenPara } from '../gamificacao/test-helpers';
import { getSaldoMoedas, getTotalXp } from '../gamificacao/ledger.service';
import { diaLocal } from '../tempo/dia';
import { criarCenarioFase1, criarVendedorExtra } from './test-helpers';

const mes = () => diaLocal(new Date(), 'America/Sao_Paulo').slice(0, 7);

let A: Awaited<ReturnType<typeof criarCenarioFase1>>;
let B: Awaited<ReturnType<typeof criarCenarioFase1>>;
let tkVend: string;
let tkAdminA: string;
let colegaA: { id: string };
let vendB: { id: string };

beforeAll(async () => {
  A = await criarCenarioFase1({ mes: mes(), metaMensal: 3000, diasPrevistos: 30 });
  B = await criarCenarioFase1({ mes: mes(), metaMensal: 3000, diasPrevistos: 30 });
  await prisma.vendedor.updateMany({ where: { id: { in: [A.vendedor.id, B.vendedor.id] } }, data: { status: 'ACTIVE' } });
  colegaA = await criarVendedorExtra(A.empresa.id, A.loja.id, 'Colega A');
  vendB = B.vendedor;
  tkVend = await tokenPara({ vendedorId: A.vendedor.id, empresaId: A.empresa.id, lojaId: A.loja.id, papel: 'VENDEDOR' });
  const adminA = await criarVendedorExtra(A.empresa.id, A.loja.id, 'Admin A');
  tkAdminA = await tokenPara({ vendedorId: adminA.id, empresaId: A.empresa.id, lojaId: A.loja.id, papel: 'ADMIN' });
});

const comVend = (r: request.Test) => r.set('Authorization', `Bearer ${tkVend}`);

describe('§22 — vendedor tentando sair do próprio escopo', () => {
  it('enviar outro vendedorId / lojaId / empresaId (query, corpo e cabeçalho) é ignorado: o painel é sempre o dele', async () => {
    const r = await comVend(request(app).get(`/app/painel?vendedorId=${colegaA.id}&lojaId=${B.loja.id}&empresaId=${B.empresa.id}`).set('x-empresa-id', B.empresa.id));
    expect(r.status).toBe(200);
    expect(r.body.vendedor.id).toBe(A.vendedor.id);
    expect(r.body.lojas.map((l: { id: string }) => l.id)).not.toContain(B.loja.id);
    const acesso = await comVend(request(app).post('/engajamento/acesso').send({ vendedorId: colegaA.id, empresaId: B.empresa.id }));
    expect(acesso.status).toBe(200);
    expect(await prisma.acessoDiario.count({ where: { vendedorId: colegaA.id } })).toBe(0);
    expect(await prisma.acessoDiario.count({ where: { vendedorId: vendB.id } })).toBe(0);
  });

  it('alterar o papel no token: assinatura inválida → 401; papel diferente do banco → 401', async () => {
    const payload = jwt.decode(tkVend) as Record<string, unknown>;
    const semSegredo = jwt.sign({ ...payload, papel: 'ADMIN' }, 'chave-que-nao-e-a-do-servidor-0123456789');
    expect((await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${semSegredo}`)).status).toBe(401);
    const { iat: _i, exp: _e, iss: _s, ...claims } = payload;
    const papelTrocado = jwt.sign({ ...claims, papel: 'ADMIN' }, env.JWT_SECRET, { issuer: env.JWT_ISSUER, expiresIn: '1h' });
    expect((await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${papelTrocado}`)).status).toBe(401);
    const alg = ['eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0', Buffer.from(JSON.stringify({ ...claims, papel: 'ADMIN' })).toString('base64url'), ''].join('.');
    expect((await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${alg}`)).status).toBe(401);
  });

  it.each([
    ['ler a central do Admin', 'get', '/admin/fase1/estado', undefined],
    ['fabricar XP/VendaCoins (ajuste)', 'post', '/admin/fase1/ajustes', { vendedorId: 'X', xp: 999, moedas: 999, motivo: 'eu mesmo me dando pontos', chave: 'k' }],
    ['alterar meta', 'put', `/admin/fase1/metas/${mes()}/vendedores/X`, { mensal: 1, diasPrevistos: 1 }],
    ['alterar regra de ranking', 'put', '/admin/fase1/config', {}],
    ['fabricar prêmio', 'post', '/admin/fase1/premios', { nome: 'Prêmio', tipo: 'DIGITAL', xp: 999, moedas: 0, comBadge: false, categoria: null, descricao: '' }],
    ['criar/alterar missão', 'post', '/admin/fase1/missoes', {}],
    ['alterar campanha', 'post', '/admin/fase1/campanhas', {}],
    ['criar competição', 'post', '/admin/fase1/competicoes', {}],
    ['ver integrações/segredos', 'get', '/admin/fase1/integracoes', undefined],
    ['trocar credencial', 'put', '/admin/fase1/integracoes/X/credencial', { credencial: 'x'.repeat(20) }],
    ['ver saúde/auditoria', 'get', '/admin/fase1/auditoria', undefined],
    ['reconhecer a si mesmo', 'post', '/admin/fase1/reconhecimentos', {}],
    ['cadastrar pessoa', 'post', '/admin/vendedores', {}],
    ['ligar recompensa de acesso', 'put', '/admin/engajamento/config', { ativo: true, xp: 100, moedas: 100 }],
  ] as const)('endpoint de Admin — %s → 403', async (_nome, metodo, caminho, corpo) => {
    const r = await comVend((request(app) as any)[metodo](caminho).send(corpo ?? {}));
    expect(r.status).toBe(403);
  });

  it.each([
    ['fabricar venda', 'post', '/vendas'],
    ['fabricar venda pelo app', 'post', '/app/vendas'],
    ['creditar XP direto', 'post', '/gamificacao/xp'],
    ['alterar saldo', 'put', '/gamificacao/saldo'],
    ['concluir missão manualmente (rota legada)', 'post', '/missoes/qualquer/concluir'],
    ['alterar ranking', 'post', '/ranking'],
    ['metas manuais legadas', 'post', '/metas'],
  ] as const)('rota inexistente no piloto — %s → 404 (deny by default)', async (_n, metodo, caminho) => {
    const r = await comVend((request(app) as any)[metodo](caminho).send({ valor: 99999, xp: 9999 }));
    expect(r.status).toBe(404);
  });

  it('nada do que foi tentado mudou o ledger do vendedor', async () => {
    expect(await getTotalXp(A.vendedor.id)).toBe(0);
    expect(await getSaldoMoedas(A.vendedor.id)).toBe(0);
    expect(await prisma.venda.count({ where: { vendedorId: A.vendedor.id } })).toBe(0);
  });
});

describe('§22 — empresa/loja A tentando B', () => {
  it('Admin A não lê nem altera vendedor, loja, integração ou missão da empresa B', async () => {
    const comAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${tkAdminA}`);
    const tentativas = [
      comAdmin(request(app).get(`/admin/vendedores/${vendB.id}`)),
      comAdmin(request(app).put(`/admin/fase1/metas/${mes()}/vendedores/${vendB.id}`).send({ mensal: 1, diasPrevistos: 1 })),
      comAdmin(request(app).put(`/admin/fase1/metas/${mes()}/lojas/${B.loja.id}`).send({ valor: 1 })),
      comAdmin(request(app).post(`/admin/vendedores/${vendB.id}/bloquear`).send({ motivo: 'invasão' })),
      comAdmin(request(app).post(`/admin/fase1/integracoes/${B.integracao.id}/sincronizar`)),
      comAdmin(request(app).put(`/admin/fase1/integracoes/${A.integracao.id}/lojas/${B.loja.id}`).send({ codigoExterno: 'X' })),
      comAdmin(request(app).post('/admin/fase1/ajustes').send({ vendedorId: vendB.id, xp: 10, moedas: 0, motivo: 'tentativa entre empresas', chave: '00000000-0000-4000-8000-0000000000ab' })),
      comAdmin(request(app).put(`/admin/fase1/vendedores/${vendB.id}/elegibilidade`).send({ elegivel: false, motivo: 'tentativa entre empresas' })),
    ];
    for (const r of await Promise.all(tentativas)) expect([403, 404], `${r.status} ${JSON.stringify(r.body)}`).toContain(r.status);
    expect((await prisma.vendedor.findUniqueOrThrow({ where: { id: vendB.id } })).status).toBe('ACTIVE');
    expect(await getTotalXp(vendB.id)).toBe(0);
  });

  it('campanha (mesmo rascunho) não aceita competição, prêmio ou loja da empresa B', async () => {
    const premioB = await prisma.premio.create({ data: { empresaId: B.empresa.id, nome: 'Prêmio B', tipo: 'DIGITAL', xp: 1, moedas: 0, criadoPor: vendB.id } });
    const base = { nome: 'Invasora', descricao: 'd', objetivo: 'o', inicio: new Date().toISOString(), fim: new Date(Date.now() + 86_400_000).toISOString(), regras: 'r' };
    const comAdmin = (corpo: object) => request(app).post('/admin/fase1/campanhas').set('Authorization', `Bearer ${tkAdminA}`).send({ ...base, ...corpo });
    expect((await comAdmin({ lojas: 'TODAS', frentes: [{ id: 'f', icone: '🏆', titulo: 'T', mecanismo: 'META_MES', refId: null, premioId: premioB.id }] })).status).toBe(400);
    expect((await comAdmin({ lojas: [B.loja.id], frentes: [] })).status).toBe(400);
    expect(await prisma.campanha.count({ where: { empresaId: A.empresa.id, nome: 'Invasora' } })).toBe(0);
  });

  it('estado do Admin A não contém nenhum dado de B', async () => {
    const r = await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${tkAdminA}`);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain(vendB.id);
    expect(texto).not.toContain(B.loja.id);
    expect(texto).not.toContain(B.integracao.id);
  });
});

describe('§22 — sessões e duplicidade', () => {
  it('usuário bloqueado não reutiliza token; token anterior à troca de senha não opera', async () => {
    const v = await criarVendedorExtra(A.empresa.id, A.loja.id, 'Temporária');
    await prisma.vendedor.update({ where: { id: v.id }, data: { status: 'ACTIVE', papel: 'VENDEDOR' } });
    const tk = await tokenPara({ vendedorId: v.id, empresaId: A.empresa.id, lojaId: A.loja.id, papel: 'VENDEDOR' });
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${tk}`)).status).toBe(200);
    await request(app).post(`/admin/vendedores/${v.id}/bloquear`).set('Authorization', `Bearer ${tkAdminA}`).send({ motivo: 'teste' }).expect(200);
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${tk}`)).status).toBe(401);
    await request(app).post(`/admin/vendedores/${v.id}/desbloquear`).set('Authorization', `Bearer ${tkAdminA}`).send({ motivo: 'teste' }).expect(200);
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${tk}`)).status).toBe(401);

    // troca de senha (versão de sessão sobe): token anterior morre
    const novo = await tokenPara({ vendedorId: v.id, empresaId: A.empresa.id, lojaId: A.loja.id, papel: 'VENDEDOR' });
    await prisma.vendedor.update({ where: { id: v.id }, data: { sessaoVersao: { increment: 1 } } });
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${novo}`)).status).toBe(401);
  });

  it('a mesma requisição de acesso disparada 10 vezes ao mesmo tempo concede UMA recompensa', async () => {
    await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${tkAdminA}`).send({ ativo: true, xp: 10, moedas: 5 }).expect(200);
    const v = await criarVendedorExtra(A.empresa.id, A.loja.id, 'Primeiro acesso');
    await prisma.vendedor.update({ where: { id: v.id }, data: { status: 'ACTIVE', papel: 'VENDEDOR' } });
    const tk = await tokenPara({ vendedorId: v.id, empresaId: A.empresa.id, lojaId: A.loja.id, papel: 'VENDEDOR' });
    await Promise.all(Array.from({ length: 10 }, () => request(app).post('/engajamento/acesso').set('Authorization', `Bearer ${tk}`)));
    expect(await getTotalXp(v.id)).toBe(10);
    expect(await getSaldoMoedas(v.id)).toBe(5);
  });
});

describe('§23 — segredo de integração', () => {
  it('credencial nunca volta em GET, nem fica em claro no banco ou na auditoria', async () => {
    const segredo = `segredo-teste-${Date.now()}-abcdef`;
    const comAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${tkAdminA}`);
    await comAdmin(request(app).put(`/admin/fase1/integracoes/${A.integracao.id}/credencial`).send({ credencial: segredo })).expect(200);
    const lista = await comAdmin(request(app).get('/admin/fase1/integracoes'));
    const saude = await comAdmin(request(app).get('/admin/fase1/saude'));
    const estado = await comAdmin(request(app).get('/admin/fase1/estado'));
    for (const r of [lista, saude, estado]) expect(JSON.stringify(r.body)).not.toContain(segredo);
    const linha = await prisma.integracao.findUniqueOrThrow({ where: { id: A.integracao.id } });
    expect(JSON.stringify(linha)).not.toContain(segredo);
    const auditoria = await prisma.auditEvent.findMany({ where: { empresaId: A.empresa.id } });
    expect(JSON.stringify(auditoria)).not.toContain(segredo);
  });
});
