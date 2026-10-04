// Jornadas da Fase 1 no nível da API (banco de teste dedicado). A venda entra
// SEMPRE pelo adapter CONTROLADO (arquivo de eventos do contrato do ERP →
// sync → ingestão → reconciliação) — o mesmo caminho que a Linx vai usar.
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { prisma } from '../db';
import { env } from '../config';
import { tokenPara } from '../gamificacao/test-helpers';
import { getSaldoMoedas, getTotalXp } from '../gamificacao/ledger.service';
import { diaLocal, somarDias } from '../tempo/dia';
import { EventoErp } from '../integracoes/erp';
import { sincronizarIntegracao } from './integracoes/sync.service';
import { cancelamento, criarCenarioFase1, criarVendedorExtra, definirDias, definirMetaMensal, devolucao, emLocal, item, venda } from './test-helpers';
import './missoes/missoes.service';

const TZ = 'America/Sao_Paulo';
const agora = () => new Date();
const hoje = () => diaLocal(agora(), TZ);
const mes = () => hoje().slice(0, 7);
const horaSegura = () => {
  // Venda "agora" menos 1 minuto — sempre dentro da janela do sync.
  return new Date(Date.now() - 60_000).toISOString();
};

function depositar(integracaoId: string, eventos: EventoErp[]) {
  const pasta = join(env.ERP_CONTROLADO_DIR!, integracaoId);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(eventos));
}

async function cenarioCompleto(metaMensal = 3000, dias = 30) {
  const c = await criarCenarioFase1({ mes: mes(), metaMensal, diasPrevistos: dias });
  await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
  const token = await tokenPara({ vendedorId: c.vendedor.id, empresaId: c.empresa.id, lojaId: c.loja.id, papel: 'VENDEDOR' });
  const admin = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Admin Teste');
  const tokenAdmin = await tokenPara({ vendedorId: admin.id, empresaId: c.empresa.id, lojaId: c.loja.id, papel: 'ADMIN' });
  const vender = async (valor: number, extra: Partial<Parameters<typeof item>[1]> = {}, vendedorExterno = c.vendedor.matriculaErp) => {
    const e = venda(c.loja.codigoErp, vendedorExterno, horaSegura(), [item(valor, extra)]);
    depositar(c.integracao.id, [e]);
    await sincronizarIntegracao(c.integracao.id);
    return e;
  };
  const painel = async (t = token) => (await request(app).get('/app/painel').set('Authorization', `Bearer ${t}`)).body;
  return { ...c, token, tokenAdmin, admin, vender, painel };
}

beforeAll(() => rmSync(env.ERP_CONTROLADO_DIR!, { recursive: true, force: true }));

describe('E2/E3 — meta de hoje derivada e venda pelo adapter atualizando a performance', () => {
  it('meta mensal ÷ dias previstos vira a Meta de Hoje; venda entra pelo ERP Adapter e aparece no painel', async () => {
    const c = await cenarioCompleto(3000, 30);
    let p = await c.painel();
    expect(p.hoje.meta).toBe(100);
    expect(p.mes.meta).toBe(3000);
    expect(p.hoje.realizado.faturamento).toBe(0);

    await c.vender(80, { pares: 2, quantidade: 2 });
    p = await c.painel();
    expect(p.hoje.realizado).toMatchObject({ faturamento: 80, vendas: 1, pares: 2 });
    expect(p.mes.realizado.faturamento).toBe(80);
    expect(p.status.sincronizadoEm).not.toBeNull();
    expect(p.status.desatualizado).toBe(false);
  });

  it('Admin altera meta mensal e dias previstos pela API e a Meta de Hoje muda na hora (sem terminal)', async () => {
    const c = await cenarioCompleto(3000, 30);
    const r = await request(app).put(`/admin/fase1/metas/${mes()}/vendedores/${c.vendedor.id}`).set('Authorization', `Bearer ${c.tokenAdmin}`).send({ mensal: 5200, diasPrevistos: 26 });
    expect(r.status).toBe(200);
    expect((await c.painel()).hoje.meta).toBe(200);
    expect(await prisma.auditEvent.count({ where: { empresaId: c.empresa.id, acao: { in: ['MONTHLY_GOAL_SET', 'WORKDAYS_SET'] } } })).toBe(2);
  });
});

describe('E4–E7 — ranking do mês com desempate D9', () => {
  it('venda move o ranking; empate em R$ desempata por acessos; depois por ticket; três iguais = mesma posição', async () => {
    const c = await cenarioCompleto();
    const b = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Bruna');
    const d = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Dora');
    for (const v of [b, d]) {
      await definirMetaMensal(v.id, mes(), 3000);
      await definirDias(v.id, mes(), 30);
    }
    await c.vender(300);
    await c.vender(300, {}, b.matriculaErp);
    let p = await c.painel();
    let linhas = p.rankings.loja.VENDAS;
    // Empate em R$ (300 × 300) e em acessos (0 × 0) e ticket igual → mesma posição.
    expect(linhas.find((l: { pessoaId: string }) => l.pessoaId === c.vendedor.id).posicao).toBe(1);
    expect(linhas.find((l: { pessoaId: string }) => l.pessoaId === b.id).posicao).toBe(1);
    expect(linhas.find((l: { pessoaId: string }) => l.pessoaId === c.vendedor.id).empatado).toBe(true);

    // 2º critério: mais acessos no mês.
    await request(app).post('/engajamento/acesso').set('Authorization', `Bearer ${c.token}`);
    p = await c.painel();
    linhas = p.rankings.loja.VENDAS;
    expect(linhas.find((l: { pessoaId: string }) => l.pessoaId === c.vendedor.id).posicao).toBe(1);
    expect(linhas.find((l: { pessoaId: string }) => l.pessoaId === b.id).posicao).toBe(2);

    // 3º critério: mesmo R$ e mesmos acessos → maior ticket. Dora: 300 em 1 venda (ticket 300); Bruna: + venda de 0? — usa 2 vendas de 150.
    await prisma.acessoDiario.deleteMany({ where: { vendedorId: c.vendedor.id } });
    await c.vender(150, {}, d.matriculaErp);
    await c.vender(150, {}, d.matriculaErp);
    p = await c.painel();
    linhas = p.rankings.loja.VENDAS;
    const pos = (id: string) => linhas.find((l: { pessoaId: string }) => l.pessoaId === id).posicao;
    expect(pos(c.vendedor.id)).toBe(1); // ticket 300
    expect(pos(b.id)).toBe(1); // ticket 300 — empatado com o vendedor (três critérios iguais)
    expect(pos(d.id)).toBe(3); // mesmo R$, ticket 150 → atrás; posição pula (1, 1, 3)
  });

  it('privacidade: o R$ dos colegas nunca chega ao app; a própria linha traz valor e distância', async () => {
    const c = await cenarioCompleto();
    const b = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Bruna');
    await c.vender(100);
    await c.vender(250, {}, b.matriculaErp);
    const linhas = (await c.painel()).rankings.loja.VENDAS;
    const eu = linhas.find((l: { pessoaId: string }) => l.pessoaId === c.vendedor.id);
    const colega = linhas.find((l: { pessoaId: string }) => l.pessoaId === b.id);
    expect(colega.valor).toBeNull();
    expect(eu.valor).toBe(100);
    expect(eu.distanciaAcima).toBe(150);
  });
});

describe('E8–E10/E13–E15 — missão governada, Produto da Semana, recompensa e cancelamento', () => {
  async function missaoProduto(c: Awaited<ReturnType<typeof cenarioCompleto>>) {
    await request(app).post('/admin/fase1/produtos').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ referencia: '12345', nome: 'Scarpin Nude', categoria: 'Salto', preco: 289.9 });
    const inicio = new Date(Date.now() - 3600_000).toISOString();
    const fim = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const criada = await request(app).post('/admin/fase1/missoes').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ nome: 'Scarpin da semana', tipo: 'PRODUTO_SEMANA', template: 'PRODUTO_SEMANA', descricao: 'Venda 3 pares do Scarpin', unidade: 'par', alvo: 3, xp: 30, moedas: 10, premioId: null, lojas: 'TODAS', inicio, fim, produtos: ['12345'], regras: 'Conta par da referência.', parametros: {} });
    expect(criada.status).toBe(201);
    const pub = await request(app).post(`/admin/fase1/missoes/${criada.body.id}/publicar`).set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('ATIVA');
    return criada.body.id as string;
  }

  it('venda do produto progride; conclusão paga UMA vez; cancelamento desfaz; cancelamento repetido não estorna de novo', async () => {
    const c = await cenarioCompleto(30000, 30);
    const missaoId = await missaoProduto(c);
    await c.vender(289.9, { referencia: '12345', pares: 1 });
    await c.vender(500, { referencia: 'OUTRA', pares: 1 });
    let m = (await c.painel()).missoes.find((x: { id: string }) => x.id === missaoId);
    expect(m.progresso).toBe(1);

    const v2 = await c.vender(579.8, { referencia: '12345', pares: 2, quantidade: 2 });
    m = (await c.painel()).missoes.find((x: { id: string }) => x.id === missaoId);
    expect(m.progresso).toBe(3);
    expect(m.concluidaEm).toBeTruthy();
    const xpMissao = () => prisma.xpTransacao.aggregate({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'MISSAO_GOVERNADA' }, _sum: { quantidade: true } });
    expect((await xpMissao())._sum.quantidade).toBe(30);

    // Reprocessar o mesmo arquivo de eventos (sync repetido) não paga de novo.
    await sincronizarIntegracao(c.integracao.id);
    expect((await xpMissao())._sum.quantidade).toBe(30);

    // Cancelamento derruba o progresso abaixo do alvo → estorno de XP e VendaCoins.
    const canc = cancelamento(v2.idExterno, horaSegura());
    depositar(c.integracao.id, [canc]);
    await sincronizarIntegracao(c.integracao.id);
    m = (await c.painel()).missoes.find((x: { id: string }) => x.id === missaoId);
    expect(m.progresso).toBe(1);
    expect(m.concluidaEm).toBeUndefined();
    expect((await xpMissao())._sum.quantidade).toBe(0);
    const moedasMissao = await prisma.moedaTransacao.aggregate({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'MISSAO_GOVERNADA' }, _sum: { valor: true } });
    expect(moedasMissao._sum.valor).toBe(0);

    depositar(c.integracao.id, [canc, cancelamento(v2.idExterno, horaSegura())]);
    await sincronizarIntegracao(c.integracao.id);
    expect(await prisma.xpTransacao.count({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'MISSAO_GOVERNADA', tipoEvento: 'REVERSAO' } })).toBe(1);
  });

  it('devolução parcial reduz pares do Produto da Semana', async () => {
    const c = await cenarioCompleto(30000, 30);
    const missaoId = await missaoProduto(c);
    const v = await c.vender(579.8, { referencia: '12345', pares: 2, quantidade: 2 });
    depositar(c.integracao.id, [devolucao(v.idExterno, horaSegura(), [item(289.9, { referencia: '12345', pares: 1 })])]);
    await sincronizarIntegracao(c.integracao.id);
    expect((await c.painel()).missoes.find((x: { id: string }) => x.id === missaoId).progresso).toBe(1);
  });

  it('venda que bate a meta do dia credita XP/VendaCoins (régua v1) e o cancelamento estorna os dois', async () => {
    const c = await cenarioCompleto(3000, 30);
    const v = await c.vender(100);
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(50);
    depositar(c.integracao.id, [cancelamento(v.idExterno, horaSegura())]);
    await sincronizarIntegracao(c.integracao.id);
    expect(await getTotalXp(c.vendedor.id)).toBe(0);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(0);
    const p = await c.painel();
    expect(p.xp.historico.some((h: { origem: string }) => h.origem.startsWith('Estorno'))).toBe(true);
  });
});

describe('E11/E12 — campanha e competição', () => {
  it('competição individual: classificação real, encerramento congela o resultado e premia o 1º uma vez', async () => {
    const c = await cenarioCompleto(3000, 30);
    const b = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Bruna');
    const premio = await request(app).post('/admin/fase1/premios').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ nome: 'Prêmio Sprint', tipo: 'DIGITAL', xp: 100, moedas: 40 });
    const comp = await request(app)
      .post('/admin/fase1/competicoes')
      .set('Authorization', `Bearer ${c.tokenAdmin}`)
      .send({ nome: 'Sprint', tipo: 'VENDEDOR', formato: 'SEMANAL', metrica: 'QTD_VENDAS', escopo: 'TODAS', regra: 'Mais vendas.', inicio: new Date(Date.now() - 3600_000).toISOString(), fim: new Date(Date.now() + 86_400_000).toISOString(), premioIds: [premio.body.id] });
    expect(comp.status).toBe(201);
    await c.vender(100);
    await c.vender(100);
    await c.vender(90, {}, b.matriculaErp);
    let p = await c.painel();
    const viva = p.competicoes.find((x: { id: string }) => x.id === comp.body.id);
    expect(viva.participantes[0]).toMatchObject({ id: c.vendedor.id, valor: 2 });

    const fim = await request(app).post(`/admin/fase1/competicoes/${comp.body.id}/encerrar`).set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(fim.status).toBe(200);
    await request(app).post(`/admin/fase1/competicoes/${comp.body.id}/encerrar`).set('Authorization', `Bearer ${c.tokenAdmin}`);
    const premiado = await prisma.xpTransacao.aggregate({ where: { vendedorId: c.vendedor.id, referenciaTipo: 'COMPETICAO_PREMIO' }, _sum: { quantidade: true } });
    expect(premiado._sum.quantidade).toBe(100);
    p = await c.painel();
    expect(p.competicoes.find((x: { id: string }) => x.id === comp.body.id).status).toBe('ENCERRADA');
  });

  it('campanha: publica, mostra a situação de cada frente, encerra e o resultado permanece (com meus ganhos)', async () => {
    const c = await cenarioCompleto(1000, 10);
    const premio = await request(app).post('/admin/fase1/premios').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ nome: 'Meta batida', tipo: 'DIGITAL', xp: 200, moedas: 80 });
    const inicio = new Date(Date.now() - 3600_000).toISOString();
    const fim = new Date(Date.now() + 86_400_000).toISOString();
    const camp = await request(app)
      .post('/admin/fase1/campanhas')
      .set('Authorization', `Bearer ${c.tokenAdmin}`)
      .send({ nome: 'Outubro Campeão', descricao: 'Programa do mês', objetivo: 'Acelerar', inicio, fim, lojas: 'TODAS', regras: 'Vendas do período.', frentes: [{ id: 'meta', icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', refId: null, premioId: premio.body.id }] });
    expect(camp.status).toBe(201);
    const pub = await request(app).post(`/admin/fase1/campanhas/${camp.body.id}/publicar`).set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(pub.body.status).toBe('ATIVA');
    await c.vender(500);
    let p = await c.painel();
    const ativa = p.campanhas.find((x: { id: string }) => x.id === camp.body.id);
    expect(ativa.frentes[0].situacao).toMatch(/Você está em/);

    const enc = await request(app).post(`/admin/fase1/campanhas/${camp.body.id}/encerrar`).set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(enc.body.status).toBe('ENCERRADA');
    p = await c.painel();
    const encerrada = p.campanhas.find((x: { id: string }) => x.id === camp.body.id);
    expect(encerrada.status).toBe('ENCERRADA');
    expect(encerrada.meusGanhos).toEqual({ xp: 200, moedas: 80 });
    // Resultado congelado: venda nova depois do encerramento não muda o que foi registrado.
    const congelado = (await prisma.campanha.findUniqueOrThrow({ where: { id: camp.body.id } })).resultado;
    await c.vender(5000);
    expect((await prisma.campanha.findUniqueOrThrow({ where: { id: camp.body.id } })).resultado).toEqual(congelado);
  });
});

describe('E18/E19 — reconhecimento e recorde', () => {
  it('Admin reconhece pela API e o vendedor recebe (painel + feed + auditoria)', async () => {
    const c = await cenarioCompleto();
    const r = await request(app).post('/admin/fase1/reconhecimentos').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ vendedorId: c.vendedor.id, motivo: 'RESULTADO', titulo: 'Atendimento nota 10', mensagem: 'Três clientes elogiaram você.' });
    expect(r.status).toBe(201);
    const p = await c.painel();
    expect(p.reconhecimentos[0]).toMatchObject({ titulo: 'Atendimento nota 10', motivo: 'RESULTADO' });
    expect(p.feed.some((e: { tipo: string; meu: boolean }) => e.tipo === 'RECONHECIMENTO' && e.meu)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { empresaId: c.empresa.id, acao: 'RECOGNITION_CREATED' } })).toBe(1);
  });

  it('recorde de melhor dia: dia fechado acima do anterior aparece em Recordes e no feed', async () => {
    const c = await cenarioCompleto();
    const ontem = somarDias(hoje(), -1);
    const anteontem = somarDias(hoje(), -2);
    depositar(c.integracao.id, [venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(anteontem, '11:00'), [item(200)]), venda(c.loja.codigoErp, c.vendedor.matriculaErp, emLocal(ontem, '11:00'), [item(350)])]);
    await prisma.integracao.update({ where: { id: c.integracao.id }, data: { cursorSync: new Date(Date.now() - 5 * 86_400_000) } });
    await sincronizarIntegracao(c.integracao.id);
    const p = await c.painel();
    expect(p.recordes.find((r: { tipo: string }) => r.tipo === 'MELHOR_DIA')).toMatchObject({ valor: 350, quando: ontem });
    expect(p.feed.some((e: { tipo: string }) => e.tipo === 'RECORDE')).toBe(true);
  });
});

describe('E20–E24 — segurança, escopo e saúde', () => {
  it('Empresa A não vê nem administra B; IDs de B na URL viram 404', async () => {
    const a = await cenarioCompleto();
    const b = await cenarioCompleto();
    const meta = await request(app).put(`/admin/fase1/metas/${mes()}/vendedores/${b.vendedor.id}`).set('Authorization', `Bearer ${a.tokenAdmin}`).send({ mensal: 1, diasPrevistos: 1 });
    expect(meta.status).toBe(404);
    const estado = await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${a.tokenAdmin}`);
    expect(estado.body.vendedores.some((v: { id: string }) => v.id === b.vendedor.id)).toBe(false);
    const elegib = await request(app).put(`/admin/fase1/vendedores/${b.vendedor.id}/elegibilidade`).set('Authorization', `Bearer ${a.tokenAdmin}`).send({ elegivel: false, motivo: 'tentativa cruzada' });
    expect(elegib.status).toBe(404);
  });

  it('vendedor não chama rota de Admin, não fabrica venda nem recompensa e o corpo é ignorado no painel', async () => {
    const c = await cenarioCompleto();
    expect((await request(app).get('/admin/fase1/estado').set('Authorization', `Bearer ${c.token}`)).status).toBe(403);
    expect((await request(app).post('/admin/fase1/ajustes').set('Authorization', `Bearer ${c.token}`).send({ vendedorId: c.vendedor.id, xp: 1000, motivo: 'eu mesmo quero', chave: randomUUID() })).status).toBe(403);
    expect((await request(app).post('/admin/fase1/integracoes/qualquer/sincronizar').set('Authorization', `Bearer ${c.token}`)).status).toBe(403);
    // Não existe rota para o app enviar venda, XP, progresso ou "concluir".
    for (const rota of ['/app/vendas', '/app/xp', '/app/missoes/concluir', '/missoes/x/concluir']) {
      expect((await request(app).post(rota).set('Authorization', `Bearer ${c.token}`).send({ valor: 99999 })).status).toBe(404);
    }
    expect(await getTotalXp(c.vendedor.id)).toBe(0);
  });

  it('bloqueado perde acesso na hora; senha trocada invalida o token anterior', async () => {
    const c = await cenarioCompleto();
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${c.token}`)).status).toBe(200);
    expect((await request(app).post(`/admin/vendedores/${c.vendedor.id}/bloquear`).set('Authorization', `Bearer ${c.tokenAdmin}`)).status).toBe(200);
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${c.token}`)).status).toBe(401);

    const d = await cenarioCompleto();
    const bcrypt = await import('bcryptjs');
    await prisma.vendedor.update({ where: { id: d.vendedor.id }, data: { senhaHash: await bcrypt.hash('senha-antiga-1', 4) } });
    const troca = await request(app).post('/auth/senha').set('Authorization', `Bearer ${d.token}`).send({ senhaAtual: 'senha-antiga-1', novaSenha: 'senha-nova-123' });
    expect(troca.status).toBe(204);
    expect((await request(app).get('/app/painel').set('Authorization', `Bearer ${d.token}`)).status).toBe(401);
  });

  it('ajuste do Admin: lançamento compensatório com motivo, idempotente, auditado — nunca saldo editado', async () => {
    const c = await cenarioCompleto();
    const chave = randomUUID();
    const corpo = { vendedorId: c.vendedor.id, xp: 50, moedas: 10, motivo: 'Correção de venda registrada fora do ERP', chave };
    expect((await request(app).post('/admin/fase1/ajustes').set('Authorization', `Bearer ${c.tokenAdmin}`).send(corpo)).status).toBe(201);
    expect((await request(app).post('/admin/fase1/ajustes').set('Authorization', `Bearer ${c.tokenAdmin}`).send(corpo)).body.duplicado).toBe(true);
    expect(await getTotalXp(c.vendedor.id)).toBe(50);
    expect((await request(app).post('/admin/fase1/ajustes').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ ...corpo, chave: randomUUID(), moedas: -999 })).status).toBe(400);
    expect(await prisma.auditEvent.count({ where: { empresaId: c.empresa.id, acao: 'LEDGER_ADJUSTMENT' } })).toBe(1);
  });

  it('E24: integração atrasada → Saúde em ATENÇÃO; com erro → FALHA; vendedor vê dado desatualizado', async () => {
    const c = await cenarioCompleto();
    await c.vender(10);
    await prisma.workerHeartbeat.upsert({ where: { nome: 'worker' }, create: { nome: 'worker', ultimoEm: new Date() }, update: { ultimoEm: new Date() } });
    let s = (await request(app).get('/admin/fase1/saude').set('Authorization', `Bearer ${c.tokenAdmin}`)).body;
    expect(s.integracoes[0].estado).toBe('OPERACIONAL');

    await prisma.integracao.update({ where: { id: c.integracao.id }, data: { ultimaSyncSucessoEm: new Date(Date.now() - 120 * 60_000) } });
    s = (await request(app).get('/admin/fase1/saude').set('Authorization', `Bearer ${c.tokenAdmin}`)).body;
    expect(s.integracoes[0].estado).toBe('ATENCAO');
    expect((await c.painel()).status.desatualizado).toBe(true);

    await prisma.integracaoExecucao.create({ data: { integracaoId: c.integracao.id, empresaId: c.empresa.id, status: 'ERRO', erro: 'Falha simulada', finalizadaEm: new Date() } });
    s = (await request(app).get('/admin/fase1/saude').set('Authorization', `Bearer ${c.tokenAdmin}`)).body;
    expect(s.integracoes[0].estado).toBe('FALHA');
    expect(s.geral.estado).toBe('FALHA');
  });

  it('T2: credencial de integração é cifrada, mascarada e nunca devolvida/auditada em claro', async () => {
    const c = await cenarioCompleto();
    const nova = await request(app).post('/admin/fase1/integracoes').set('Authorization', `Bearer ${c.tokenAdmin}`).send({ provedor: 'LINX', configuracao: { urlBase: 'https://linx.exemplo.com' } });
    expect(nova.status).toBe(201);
    const segredo = 'segredo-super-secreto-ABCD';
    const r = await request(app).put(`/admin/fase1/integracoes/${nova.body.id}/credencial`).set('Authorization', `Bearer ${c.tokenAdmin}`).send({ credencial: segredo });
    expect(r.status).toBe(200);
    expect(r.body.credencial).toBe('••••••••ABCD');
    expect(JSON.stringify(r.body)).not.toContain(segredo);
    const lista = await request(app).get('/admin/fase1/integracoes').set('Authorization', `Bearer ${c.tokenAdmin}`);
    expect(JSON.stringify(lista.body)).not.toContain(segredo);
    const linha = await prisma.integracao.findUniqueOrThrow({ where: { id: nova.body.id } });
    expect(linha.credencialCiphertext).not.toContain(segredo);
    const auditoria = await prisma.auditEvent.findMany({ where: { empresaId: c.empresa.id } });
    expect(JSON.stringify(auditoria)).not.toContain(segredo);
    // Configuração com cara de segredo é recusada (o lugar dela é a credencial cifrada).
    expect((await request(app).patch(`/admin/fase1/integracoes/${nova.body.id}`).set('Authorization', `Bearer ${c.tokenAdmin}`).send({ configuracao: { apiKey: 'x' } })).status).toBe(400);
  });
});

void agora;
