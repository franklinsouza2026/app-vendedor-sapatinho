// Integração (Postgres real) do engajamento: check-in diário com no máximo
// UMA recompensa por vendedor por dia, separação XP × VendaCoins, timezone,
// histórico, frequência e escopos de autorização (vendedor / gerente /
// admin / empresa A × B).
import { randomUUID } from 'node:crypto';
import type { Papel } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../db';
import { assinarToken } from '../middlewares/auth';
import { getSaldoMoedas, getTotalXp } from '../gamificacao/ledger.service';
import { AcessoNaoPermitidoError, registrarAcesso } from './acesso.service';
import { montarPainel } from './painel.service';
import { paraDate } from './dia';

type PapelTeste = 'VENDEDOR' | 'GERENTE' | 'ADMIN';

async function criarEmpresa(opcoes: { recompensa?: { ativo: boolean; xp: number; moedas: number } } = {}) {
  const empresa = await prisma.empresa.create({ data: { nome: `Empresa Eng ${randomUUID()}` } });
  const lojaA = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Loja A', codigoErp: `A-${randomUUID()}` } });
  const lojaB = await prisma.loja.create({ data: { empresaId: empresa.id, nome: 'Loja B', codigoErp: `B-${randomUUID()}` } });
  if (opcoes.recompensa) await prisma.configRecompensaAcesso.create({ data: { empresaId: empresa.id, ...opcoes.recompensa } });
  return { empresa, lojaA, lojaB };
}

async function criarPessoa(empresaId: string, lojaId: string, papel: PapelTeste = 'VENDEDOR', extra: { nome?: string; status?: 'ACTIVE' | 'OFFBOARDED' | 'BLOCKED'; createdAt?: Date } = {}) {
  return prisma.vendedor.create({
    data: { empresaId, lojaId, papel, nome: extra.nome ?? `${papel} ${randomUUID().slice(0, 4)}`, matriculaErp: `M-${randomUUID()}`, senhaHash: 'x', status: extra.status ?? 'ACTIVE', createdAt: extra.createdAt ?? new Date('2026-09-01T12:00:00Z') },
  });
}

function token(p: { id: string; empresaId: string; lojaId: string; papel: Papel }) {
  return assinarToken({ vendedorId: p.id, empresaId: p.empresaId, lojaId: p.lojaId, papel: p.papel });
}

// Quarta, 21/10/2026, 10:00 em São Paulo.
const QUARTA_10H = new Date('2026-10-21T13:00:00Z');

describe('check-in diário — no máximo uma recompensa por dia (garantia no banco)', () => {
  it('1º acesso registra o dia e concede a recompensa configurada; 2º acesso só atualiza', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const v = await criarPessoa(empresa.id, lojaA.id);

    const primeiro = await registrarAcesso(v.id, QUARTA_10H);
    expect(primeiro).toMatchObject({ dia: '2026-10-21', primeiroAcessoDoDia: true, recompensaAgora: { xp: 5, moedas: 2 }, recompensaHoje: { xp: 5, moedas: 2 }, quantidadeAcessosHoje: 1, streakAcesso: 1 });

    const segundo = await registrarAcesso(v.id, new Date(QUARTA_10H.getTime() + 3600_000));
    expect(segundo).toMatchObject({ primeiroAcessoDoDia: false, recompensaAgora: null, recompensaHoje: { xp: 5, moedas: 2 }, quantidadeAcessosHoje: 2 });

    const linha = await prisma.acessoDiario.findUniqueOrThrow({ where: { vendedorId_dia: { vendedorId: v.id, dia: paraDate('2026-10-21') } } });
    expect(linha).toMatchObject({ quantidadeAcessos: 2, recompensaConcedida: true, xpConcedido: 5, moedasConcedidas: 2 });
    expect(linha.ultimoAcessoEm.getTime()).toBeGreaterThan(linha.primeiroAcessoEm.getTime());
    expect(await getTotalXp(v.id)).toBe(5);
    expect(await getSaldoMoedas(v.id)).toBe(2);
  });

  it('refresh e logout/login (tokens novos) não duplicam', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/engajamento/acesso').set('Authorization', `Bearer ${token(v)}`);
      expect(res.status).toBe(200);
    }
    expect(await prisma.xpTransacao.count({ where: { vendedorId: v.id, tipoEvento: 'ACESSO_DIARIO' } })).toBe(1);
    expect(await prisma.moedaTransacao.count({ where: { vendedorId: v.id, tipoEvento: 'ACESSO_DIARIO' } })).toBe(1);
  });

  it('chamadas concorrentes (várias abas/aparelhos) concedem uma única vez', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 7, moedas: 3 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    const resultados = await Promise.all(Array.from({ length: 12 }, () => registrarAcesso(v.id, QUARTA_10H)));
    expect(resultados.filter((r) => r.primeiroAcessoDoDia)).toHaveLength(1);
    expect(resultados.filter((r) => r.recompensaAgora)).toHaveLength(1);
    expect(await prisma.acessoDiario.count({ where: { vendedorId: v.id } })).toBe(1);
    expect((await prisma.acessoDiario.findFirstOrThrow({ where: { vendedorId: v.id } })).quantidadeAcessos).toBe(12);
    expect(await getTotalXp(v.id)).toBe(7);
    expect(await getSaldoMoedas(v.id)).toBe(3);
  });

  it('recompensa desligada: registra o acesso, mas não concede XP nem VendaCoins', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: false, xp: 5, moedas: 2 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    const r = await registrarAcesso(v.id, QUARTA_10H);
    expect(r).toMatchObject({ primeiroAcessoDoDia: true, recompensaAgora: null, recompensaHoje: null });
    expect(await prisma.acessoDiario.count({ where: { vendedorId: v.id } })).toBe(1);
    expect(await getTotalXp(v.id)).toBe(0);
    expect(await getSaldoMoedas(v.id)).toBe(0);
  });

  it('sem configuração cadastrada, a recompensa fica desligada', async () => {
    const { empresa, lojaA } = await criarEmpresa();
    const v = await criarPessoa(empresa.id, lojaA.id);
    expect((await registrarAcesso(v.id, QUARTA_10H)).recompensaAgora).toBeNull();
  });

  it('alteração do Admin vale no próximo check-in elegível (não retroage no dia já reconhecido)', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    const admin = await criarPessoa(empresa.id, lojaA.id, 'ADMIN');
    await registrarAcesso(v.id, QUARTA_10H);

    const put = await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${token(admin)}`).send({ ativo: true, xp: 12, moedas: 4 });
    expect(put.status).toBe(200);

    expect((await registrarAcesso(v.id, new Date(QUARTA_10H.getTime() + 600_000))).recompensaAgora).toBeNull(); // mesmo dia
    const quinta = await registrarAcesso(v.id, new Date(QUARTA_10H.getTime() + 86_400_000));
    expect(quinta.recompensaAgora).toEqual({ xp: 12, moedas: 4 });
    expect(await getTotalXp(v.id)).toBe(17);
    expect(await getSaldoMoedas(v.id)).toBe(6);
  });

  it('XP e VendaCoins são ledgers separados; saldo = soma do ledger', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 10, moedas: 0 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    await registrarAcesso(v.id, QUARTA_10H);
    expect(await prisma.xpTransacao.count({ where: { vendedorId: v.id } })).toBe(1);
    expect(await prisma.moedaTransacao.count({ where: { vendedorId: v.id } })).toBe(0); // 0 moedas = nenhuma linha de moeda
    await prisma.configRecompensaAcesso.update({ where: { empresaId: empresa.id }, data: { xp: 0, moedas: 9 } });
    await registrarAcesso(v.id, new Date(QUARTA_10H.getTime() + 86_400_000));
    const soma = await prisma.moedaTransacao.aggregate({ where: { vendedorId: v.id }, _sum: { valor: true } });
    expect(await getSaldoMoedas(v.id)).toBe(soma._sum.valor);
    expect(await getTotalXp(v.id)).toBe(10);
    expect(await getSaldoMoedas(v.id)).toBe(9);
  });

  it('virada do dia no fuso da empresa: 23:30 e 00:10 locais são dias diferentes; 23:30 local não vira "amanhã"', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 1, moedas: 1 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    const r1 = await registrarAcesso(v.id, new Date('2026-10-22T02:30:00Z')); // 21/10 23:30 em SP (já 22/10 em UTC)
    const r2 = await registrarAcesso(v.id, new Date('2026-10-22T03:10:00Z')); // 22/10 00:10 em SP
    expect([r1.dia, r2.dia]).toEqual(['2026-10-21', '2026-10-22']);
    expect(r2.recompensaAgora).toEqual({ xp: 1, moedas: 1 });
    expect(r2.streakAcesso).toBe(2);
  });

  it('o cliente não fabrica recompensa: valores e data enviados no corpo são ignorados', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const v = await criarPessoa(empresa.id, lojaA.id);
    const res = await request(app).post('/engajamento/acesso').set('Authorization', `Bearer ${token(v)}`).send({ xp: 9999, moedas: 9999, dia: '2020-01-01', primeiroAcessoDoDia: true });
    expect(res.status).toBe(200);
    expect(res.body.recompensaAgora).toEqual({ xp: 5, moedas: 2 });
    expect(res.body.dia).not.toBe('2020-01-01');
    expect(await getSaldoMoedas(v.id)).toBe(2);
  });

  it('vendedor inativo/desligado não registra acesso; Admin não registra acesso de vendedor', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const desligado = await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { status: 'OFFBOARDED' });
    await expect(registrarAcesso(desligado.id, QUARTA_10H)).rejects.toBeInstanceOf(AcessoNaoPermitidoError);
    const admin = await criarPessoa(empresa.id, lojaA.id, 'ADMIN');
    expect((await request(app).post('/engajamento/acesso').set('Authorization', `Bearer ${token(admin)}`)).status).toBe(403);
  });
});

describe('painel de engajamento — frequência, streak, histórico e elegíveis', () => {
  it('quarta-feira: 3 de 3, 2 de 3 e 1 de 3; quem não acessou hoje aparece; inativo fica fora', async () => {
    const { empresa, lojaA } = await criarEmpresa();
    const ana = await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { nome: 'Ana' });
    const julia = await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { nome: 'Júlia' });
    const maria = await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { nome: 'Maria' });
    await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { nome: 'Desligada', status: 'OFFBOARDED' });
    const seg = new Date('2026-10-19T13:00:00Z');
    const ter = new Date('2026-10-20T13:00:00Z');
    for (const d of [seg, ter, QUARTA_10H]) await registrarAcesso(ana.id, d);
    for (const d of [seg, QUARTA_10H]) await registrarAcesso(julia.id, d);
    await registrarAcesso(maria.id, ter);

    const p = await montarPainel({ empresaId: empresa.id, lojaIds: null }, { periodo: 'SEMANA_ATUAL' }, QUARTA_10H);
    const linha = (nome: string) => p.vendedores.find((l) => l.nome === nome)!;
    expect(linha('Ana').periodo).toEqual({ diasComAcesso: 3, diasValidos: 3, percentual: 100 });
    expect(linha('Júlia').periodo).toEqual({ diasComAcesso: 2, diasValidos: 3, percentual: 67 });
    expect(linha('Maria').periodo).toEqual({ diasComAcesso: 1, diasValidos: 3, percentual: 33 });
    expect(linha('Ana').streakAtual).toBe(3);
    expect(linha('Júlia').streakAtual).toBe(1);
    expect(linha('Maria').acessouHoje).toBe(false);
    expect(p.vendedores.some((l) => l.nome === 'Desligada')).toBe(false);
    expect(p.kpis.hoje).toMatchObject({ acessaram: 2, elegiveis: 3, naoAcessaram: 1, percentual: 67 });
    expect(p.kpis.periodo).toMatchObject({ acessaram: 3, elegiveis: 3, percentual: 100, mediaDiasComAcesso: 2, mediaDiasValidos: 3 });
    expect(p.kpis.maiorStreak).toEqual({ dias: 3, vendedor: 'Ana' });
  });

  it('o histórico não some na virada da semana', async () => {
    const { empresa, lojaA } = await criarEmpresa();
    const v = await criarPessoa(empresa.id, lojaA.id);
    await registrarAcesso(v.id, new Date('2026-10-13T13:00:00Z')); // semana passada (ter)
    await registrarAcesso(v.id, new Date('2026-10-14T13:00:00Z')); // semana passada (qua)
    const p = await montarPainel({ empresaId: empresa.id, lojaIds: null }, { periodo: 'SEMANA_PASSADA' }, QUARTA_10H);
    expect(p.vendedores[0].periodo).toMatchObject({ diasComAcesso: 2, diasValidos: 7 });
    expect(await prisma.acessoDiario.count({ where: { vendedorId: v.id } })).toBe(2);
  });

  it('engajamento é contado à parte do acesso', async () => {
    const { empresa, lojaA } = await criarEmpresa();
    const v = await criarPessoa(empresa.id, lojaA.id);
    await prisma.eventoEngajamento.create({ data: { empresaId: empresa.id, lojaId: lojaA.id, vendedorId: v.id, tipo: 'MISSAO_CONCLUIDA', referenciaTipo: 'X', referenciaId: '1', dia: paraDate('2026-10-21'), chave: `t-${randomUUID()}` } });
    const p = await montarPainel({ empresaId: empresa.id, lojaIds: null }, { periodo: 'SEMANA_ATUAL' }, QUARTA_10H);
    expect(p.vendedores[0].engajamento.MISSAO_CONCLUIDA).toBe(1);
    expect(p.vendedores[0].periodo.diasComAcesso).toBe(0); // evento de engajamento NÃO conta como acesso
  });
});

describe('escopos de autorização do engajamento', () => {
  it('vendedor não acessa o painel e só vê os próprios dados em /engajamento/meu', async () => {
    const { empresa, lojaA } = await criarEmpresa({ recompensa: { ativo: true, xp: 5, moedas: 2 } });
    const a = await criarPessoa(empresa.id, lojaA.id);
    const b = await criarPessoa(empresa.id, lojaA.id);
    await registrarAcesso(b.id);
    expect((await request(app).get('/engajamento/painel').set('Authorization', `Bearer ${token(a)}`)).status).toBe(403);
    const meu = await request(app).get('/engajamento/meu').query({ vendedorId: b.id }).set('Authorization', `Bearer ${token(a)}`);
    expect(meu.status).toBe(200);
    expect(meu.body.acessouHoje).toBe(false); // é o "a", não o "b"
    expect(meu.body.config).toEqual({ ativo: true, xp: 5, moedas: 2 }); // vendedor sabe quanto ganha
  });

  it('gerente só enxerga a própria loja e é barrado ao pedir outra', async () => {
    const { empresa, lojaA, lojaB } = await criarEmpresa();
    const gerente = await criarPessoa(empresa.id, lojaA.id, 'GERENTE');
    const daA = await criarPessoa(empresa.id, lojaA.id, 'VENDEDOR', { nome: 'Da loja A' });
    await criarPessoa(empresa.id, lojaB.id, 'VENDEDOR', { nome: 'Da loja B' });
    const res = await request(app).get('/engajamento/painel').set('Authorization', `Bearer ${token(gerente)}`);
    expect(res.status).toBe(200);
    expect(res.body.vendedores.map((l: { vendedorId: string }) => l.vendedorId)).toEqual([daA.id]);
    expect((await request(app).get('/engajamento/painel').query({ lojaId: lojaB.id }).set('Authorization', `Bearer ${token(gerente)}`)).status).toBe(403);
  });

  it('Admin vê a empresa inteira; empresa A nunca vê empresa B', async () => {
    const A = await criarEmpresa();
    const B = await criarEmpresa();
    const adminA = await criarPessoa(A.empresa.id, A.lojaA.id, 'ADMIN');
    await criarPessoa(A.empresa.id, A.lojaA.id);
    await criarPessoa(A.empresa.id, A.lojaB.id);
    const deB = await criarPessoa(B.empresa.id, B.lojaA.id);
    const res = await request(app).get('/engajamento/painel').set('Authorization', `Bearer ${token(adminA)}`);
    expect(res.status).toBe(200);
    expect(res.body.vendedores).toHaveLength(2);
    expect((await request(app).get('/engajamento/painel').query({ lojaId: B.lojaA.id }).set('Authorization', `Bearer ${token(adminA)}`)).status).toBe(404);
    expect((await request(app).get('/engajamento/painel').query({ vendedorId: deB.id }).set('Authorization', `Bearer ${token(adminA)}`)).status).toBe(404);
  });

  it('só ADMIN configura a recompensa; valores inválidos são recusados; alteração é auditada', async () => {
    const { empresa, lojaA } = await criarEmpresa();
    const admin = await criarPessoa(empresa.id, lojaA.id, 'ADMIN');
    const gerente = await criarPessoa(empresa.id, lojaA.id, 'GERENTE');
    expect((await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${token(gerente)}`).send({ ativo: true, xp: 5, moedas: 2 })).status).toBe(403);
    expect((await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${token(admin)}`).send({ ativo: true, xp: -1, moedas: 2 })).status).toBe(400);
    expect((await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${token(admin)}`).send({ ativo: true, xp: 2.5, moedas: 2 })).status).toBe(400);
    const ok = await request(app).put('/admin/engajamento/config').set('Authorization', `Bearer ${token(admin)}`).send({ ativo: true, xp: 0, moedas: 3 });
    expect(ok.body).toEqual({ ativo: true, xp: 0, moedas: 3 });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { empresaId: empresa.id, acao: 'ENGAGEMENT_REWARD_CONFIG_UPDATED' } });
    expect(audit.metadata).toMatchObject({ antes: { ativo: false }, depois: { ativo: true, xp: 0, moedas: 3 } });
  });
});
