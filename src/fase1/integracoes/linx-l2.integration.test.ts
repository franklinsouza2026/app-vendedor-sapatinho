// Linx L2 — infraestrutura incremental: cursor por (integração, método,
// escopo), checkpoint só depois do processamento, replay seguro, trava,
// reconciliação, fora de ordem, multiempresa e precisão do timestamp.
// Fonte: FonteIncrementalFalsa (somente testes; imita o comportamento
// documentado do Microvix). Nenhuma chamada à Linx real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { env } from '../../config';
import { getTotalXp } from '../../gamificacao/ledger.service';
import { diaLocal, somarDias } from '../../tempo/dia';
import { cancelamento, criarCenarioFase1, criarVendedorExtra, devolucao, item, venda } from '../test-helpers';
import { FonteIncrementalFalsa } from './__testes__/fonte-incremental-falsa';
import { reconciliarIntegracao, sincronizarIntegracao } from './sync.service';
import * as cursorService from './cursor.service';

let quebrarIngestaoNaMetade = false;
let quebrarAntesDoAvanco = false;

vi.mock('../../integracoes/erp', async (original) => {
  const real = await original<typeof import('../../integracoes/erp')>();
  return { ...real, adapterDoProvedor: (provedor: Parameters<typeof real.adapterDoProvedor>[0]) => (provedor === 'LINX' ? (globalThis as { __fonteAtual?: FonteIncrementalFalsa }).__fonteAtual! : real.adapterDoProvedor(provedor)) };
});
vi.mock('../vendas/ingestao.service', async (original) => {
  const real = await original<typeof import('../vendas/ingestao.service')>();
  return {
    ...real,
    ingerirEventos: async (p: Parameters<typeof real.ingerirEventos>[0]) => {
      if (quebrarIngestaoNaMetade && p.eventos.length > 1) {
        quebrarIngestaoNaMetade = false;
        await real.ingerirEventos({ ...p, eventos: p.eventos.slice(0, Math.floor(p.eventos.length / 2)) });
        throw new Error('queda simulada no meio da ingestão');
      }
      return real.ingerirEventos(p);
    },
  };
});
vi.mock('./cursor.service', async (original) => {
  const real = await original<typeof import('./cursor.service')>();
  return {
    ...real,
    avancarCursores: async (p: Parameters<typeof real.avancarCursores>[0]) => {
      if (quebrarAntesDoAvanco) {
        quebrarAntesDoAvanco = false;
        throw new Error('queda simulada antes de avançar o cursor');
      }
      return real.avancarCursores(p);
    },
  };
});


const TZ = 'America/Sao_Paulo';
const hoje = () => diaLocal(new Date(), TZ);
const mes = () => hoje().slice(0, 7);
const antes = (min = 1) => new Date(Date.now() - min * 60_000).toISOString();
const CNPJ_A = '11111111000101';
const CNPJ_B = '22222222000102';

async function cenarioLinx(opcoes: { metaMensal?: number } = {}) {
  const c = await criarCenarioFase1({ mes: mes(), metaMensal: opcoes.metaMensal ?? 100000, diasPrevistos: 30 });
  await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
  // Integração LINX ativa com a loja vinculada pelo CNPJ (escopo do cursor).
  const integ = await prisma.integracao.create({ data: { empresaId: c.empresa.id, provedor: 'LINX', status: 'ATIVA', atualizadoPor: c.vendedor.id } });
  await prisma.integracaoLoja.create({ data: { integracaoId: integ.id, lojaId: c.loja.id, codigoExterno: CNPJ_A } });
  const fonte = new FonteIncrementalFalsa();
  (globalThis as { __fonteAtual?: FonteIncrementalFalsa }).__fonteAtual = fonte;
  const v = (valor: number, extra: { quando?: string; id?: string } = {}) => venda(CNPJ_A, c.vendedor.matriculaErp, extra.quando ?? antes(), [item(valor)], extra.id ?? `V-${randomUUID()}`);
  const cursores = () => cursorService.carregarCursores(integ.id);
  const vendasDb = () => prisma.venda.count({ where: { empresaId: c.empresa.id } });
  return { ...c, integ, fonte, v, cursores, vendasDb, sync: () => sincronizarIntegracao(integ.id), reconciliar: (dias?: number) => reconciliarIntegracao(integ.id, new Date(), dias) };
}

const paginasOriginais = env.ERP_MAX_PAGINAS_POR_EXECUCAO;
beforeEach(() => {
  quebrarIngestaoNaMetade = false;
  quebrarAntesDoAvanco = false;
});
afterEach(() => {
  (env as { ERP_MAX_PAGINAS_POR_EXECUCAO: number }).ERP_MAX_PAGINAS_POR_EXECUCAO = paginasOriginais;
});

describe('cursor — precisão e validação (timestamp é contador, não data)', () => {
  it('aceita inteiros BIGINT como string sem perder precisão acima de Number.MAX_SAFE_INTEGER', () => {
    expect(cursorService.normalizarCursor('9007199254740993')).toBe('9007199254740993'); // 2^53 + 1: Number arredondaria
    expect(cursorService.normalizarCursor('9223372036854775807')).toBe('9223372036854775807');
    expect(cursorService.normalizarCursor(' 0042 ')).toBe('42');
    expect(cursorService.normalizarCursor(9007199254740993n)).toBe('9007199254740993');
  });

  it('recusa valor não inteiro, negativo, acima de BIGINT ou numérico JS', () => {
    for (const ruim of ['-1', '1.5', 'abc', '', '9223372036854775808', '2026-10-05T00:00:00Z']) expect(() => cursorService.normalizarCursor(ruim)).toThrow(cursorService.CursorInvalido);
    expect(() => cursorService.normalizarCursor(1e21 as unknown as string)).toThrow(cursorService.CursorInvalido);
  });

  it('valor acima de 2^53 grava e volta do banco idêntico', async () => {
    const c = await cenarioLinx();
    await cursorService.avancarCursores({ empresaId: c.empresa.id, integracaoId: c.integ.id, cursores: [{ metodo: 'LinxMovimento', escopo: CNPJ_A, valor: '9223372036854775806' }], fase: 'LIVE', registros: 1 });
    expect((await c.cursores())[0].valor).toBe('9223372036854775806');
  });
});

describe('checkpoint — o cursor só avança depois do processamento confirmado', () => {
  it('cursor inicial vazio; primeiro lote grava as vendas e avança o cursor até o maior timestamp', async () => {
    const c = await cenarioLinx();
    expect(await c.cursores()).toEqual([]);
    const t1 = c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    const t2 = c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(200));
    const r = await c.sync();
    expect(r.status).toBe('SUCESSO');
    expect(await c.vendasDb()).toBe(2);
    const [cur] = await c.cursores();
    expect(cur).toMatchObject({ metodo: 'LinxMovimento', escopo: CNPJ_A, valor: (t2 > t1 ? t2 : t1).toString(), fase: 'LIVE' });
  });

  it('lote vazio: nada muda e o cursor não se mexe', async () => {
    const c = await cenarioLinx();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    await c.sync();
    const antesC = await c.cursores();
    const r = await c.sync();
    expect(r.eventosRecebidos).toBe(0);
    expect(await c.cursores()).toEqual(antesC);
  });

  it('falha da fonte ANTES de gravar: nada gravado, cursor intacto, próxima execução pega tudo', async () => {
    const c = await cenarioLinx();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    await c.sync();
    const cursorAntes = (await c.cursores())[0].valor;
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(50));
    c.fonte.falharProximaChamada = true;
    const r = await c.sync();
    expect(r.status).toBe('ERRO');
    expect((await c.cursores())[0].valor).toBe(cursorAntes);
    await c.sync();
    expect(await c.vendasDb()).toBe(2);
  });

  it('queda no MEIO da ingestão (processou parte): cursor não avança; o replay grava o resto sem duplicar', async () => {
    const c = await cenarioLinx();
    for (const valor of [10, 20, 30, 40]) c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(valor));
    quebrarIngestaoNaMetade = true;
    const r = await c.sync();
    expect(r.status).toBe('ERRO');
    expect(await c.vendasDb()).toBe(2); // metade gravada
    expect(await c.cursores()).toEqual([]); // nada avançou
    await c.sync(); // restart/replay
    expect(await c.vendasDb()).toBe(4);
    expect((await c.cursores())[0].fase).toBe('LIVE');
  });

  it('queda DEPOIS de gravar e reconciliar, antes de avançar: o replay não duplica venda nem recompensa', async () => {
    const c = await cenarioLinx({ metaMensal: 3000 }); // meta do dia = R$ 100
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(105));
    quebrarAntesDoAvanco = true;
    expect((await c.sync()).status).toBe('ERRO');
    expect(await c.cursores()).toEqual([]);
    const xp1 = await getTotalXp(c.vendedor.id);
    expect(xp1).toBe(100); // meta paga
    await c.sync(); // mesma página de novo
    expect(await c.vendasDb()).toBe(1);
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
    expect(await c.cursores()).toHaveLength(1);
  });

  it('venda/cancelamento/devolução repetidos na fonte: uma consequência cada', async () => {
    const c = await cenarioLinx();
    const a = c.v(300);
    c.fonte.publicar('LinxMovimento', CNPJ_A, a);
    c.fonte.publicar('LinxMovimento', CNPJ_A, a); // mesmo documento reaparece (alteração)
    const d = devolucao(a.idExterno, antes(), [item(100)]);
    c.fonte.publicar('LinxMovimento', CNPJ_A, d);
    c.fonte.publicar('LinxMovimento', CNPJ_A, d);
    await c.sync();
    await c.reconciliar(); // releitura completa
    const vendas = await prisma.venda.findMany({ where: { empresaId: c.empresa.id }, include: { itens: true } });
    expect(vendas).toHaveLength(1);
    expect(Number(vendas[0].itens[0].valorDevolvido)).toBe(100);
    expect(await prisma.vendaAjuste.count({ where: { empresaId: c.empresa.id } })).toBe(1);
    const cx = cancelamento(a.idExterno, antes());
    c.fonte.publicar('LinxMovimento', CNPJ_A, cx);
    c.fonte.publicar('LinxMovimento', CNPJ_A, cx);
    await c.sync();
    await c.reconciliar();
    expect(await prisma.vendaAjuste.count({ where: { empresaId: c.empresa.id, tipo: 'CANCELAMENTO' } })).toBe(1);
  });
});

describe('paginação, fases e cursor monotônico', () => {
  it('lote paginado: percorre todas as páginas; com limite por execução fica em BACKFILL e termina na próxima', async () => {
    const c = await cenarioLinx();
    c.fonte.tamanhoPagina = 2;
    for (let i = 0; i < 5; i++) c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(10 + i));
    (env as { ERP_MAX_PAGINAS_POR_EXECUCAO: number }).ERP_MAX_PAGINAS_POR_EXECUCAO = 2;
    const r1 = await c.sync();
    expect(r1.haMais).toBe(true);
    expect(await c.vendasDb()).toBe(4);
    expect((await c.cursores())[0].fase).toBe('BACKFILL');
    const r2 = await c.sync();
    expect(r2.haMais).toBe(false);
    expect(await c.vendasDb()).toBe(5);
    expect((await c.cursores())[0].fase).toBe('LIVE');
    // depois de LIVE, um atraso grande vira CATCH_UP (colocando em dia)
    for (let i = 0; i < 5; i++) c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(1 + i));
    (env as { ERP_MAX_PAGINAS_POR_EXECUCAO: number }).ERP_MAX_PAGINAS_POR_EXECUCAO = 1;
    await c.sync();
    expect((await c.cursores())[0].fase).toBe('CATCH_UP');
  });

  it('cursor nunca retrocede: gravações concorrentes e fora de ordem terminam no maior valor', async () => {
    const c = await cenarioLinx();
    const gravar = (valor: string) => cursorService.avancarCursores({ empresaId: c.empresa.id, integracaoId: c.integ.id, cursores: [{ metodo: 'LinxMovimento', escopo: CNPJ_A, valor }], fase: 'LIVE', registros: 1 });
    await Promise.all(['500', '120', '9007199254740993', '700', '9007199254740992', '300'].map(gravar));
    expect((await c.cursores())[0].valor).toBe('9007199254740993');
    const r = await gravar('10');
    expect(r.recusadosPorRetrocesso).toBe(1);
    expect((await c.cursores())[0].valor).toBe('9007199254740993');
  });

  it('cursor por método: métodos evoluem independentes', async () => {
    const c = await cenarioLinx();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    c.fonte.publicar('LinxMovimentoDevolucoesItens', CNPJ_A, { ...c.v(50), tipo: 'VENDA' });
    await c.sync();
    const cs = await c.cursores();
    expect(cs.map((x) => x.metodo).sort()).toEqual(['LinxMovimento', 'LinxMovimentoDevolucoesItens']);
    expect(new Set(cs.map((x) => x.valor)).size).toBe(2);
  });

  it('cursor por CNPJ: lojas da mesma integração têm cursores próprios', async () => {
    const c = await cenarioLinx();
    const loja2 = await prisma.loja.create({ data: { empresaId: c.empresa.id, nome: 'Loja 2', codigoErp: `L2-${randomUUID().slice(0, 6)}` } });
    await prisma.integracaoLoja.create({ data: { integracaoId: c.integ.id, lojaId: loja2.id, codigoExterno: CNPJ_B } });
    const v2 = await criarVendedorExtra(c.empresa.id, loja2.id, 'Vendedora Loja 2');
    await prisma.vendedor.update({ where: { id: v2.id }, data: { status: 'ACTIVE', papel: 'VENDEDOR' } });
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    c.fonte.publicar('LinxMovimento', CNPJ_B, venda(CNPJ_B, v2.matriculaErp, antes(), [item(80)]));
    await c.sync();
    const cs = await c.cursores();
    expect(cs.map((x) => x.escopo).sort()).toEqual([CNPJ_A, CNPJ_B].sort());
    expect(await c.vendasDb()).toBe(2);
  });

  it('cursor por empresa: mesmo método e mesmo CNPJ em empresas diferentes não se misturam', async () => {
    const a = await cenarioLinx();
    a.fonte.publicar('LinxMovimento', CNPJ_A, a.v(100));
    await a.sync();
    const b = await cenarioLinx();
    b.fonte.publicar('LinxMovimento', CNPJ_A, b.v(100));
    b.fonte.publicar('LinxMovimento', CNPJ_A, b.v(100));
    await b.sync();
    const ca = await a.cursores();
    const cb = await b.cursores();
    expect(ca).toHaveLength(1);
    expect(cb).toHaveLength(1);
    expect(await prisma.integracaoCursor.count({ where: { empresaId: a.empresa.id } })).toBe(1);
    expect(await prisma.venda.count({ where: { empresaId: a.empresa.id } })).toBe(1);
    expect(await prisma.venda.count({ where: { empresaId: b.empresa.id } })).toBe(2);
  });
});

describe('tardios, fora de ordem e reconciliação', () => {
  it('venda atrasada: lançada há 2 dias, publicada agora (timestamp novo) → capturada pelo incremental', async () => {
    const c = await cenarioLinx();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    await c.sync();
    const doisDias = new Date(`${somarDias(hoje(), -2)}T15:00:00-03:00`).toISOString();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(70, { quando: doisDias }));
    await c.sync();
    expect(await c.vendasDb()).toBe(2);
  });

  it('cancelamento e devolução parcial dias depois chegam com timestamp novo e compensam', async () => {
    const c = await cenarioLinx();
    const a = c.v(300);
    const b = c.v(200);
    c.fonte.publicar('LinxMovimento', CNPJ_A, a);
    c.fonte.publicar('LinxMovimento', CNPJ_A, b);
    await c.sync();
    c.fonte.publicar('LinxMovimento', CNPJ_A, cancelamento(a.idExterno, antes()));
    c.fonte.publicar('LinxMovimento', CNPJ_A, devolucao(b.idExterno, antes(), [item(50)]));
    await c.sync();
    const vendas = await prisma.venda.findMany({ where: { empresaId: c.empresa.id }, include: { itens: true } });
    expect(vendas.find((x) => x.idExterno === a.idExterno)!.status).toBe('CANCELADA');
    expect(Number(vendas.find((x) => x.idExterno === b.idExterno)!.itens[0].valorDevolvido)).toBe(50);
  });

  it('fora de ordem: devolução chega (outro método) antes da venda → fica pendente, aplica quando a venda chega', async () => {
    const c = await cenarioLinx();
    const a = c.v(300, { id: `V-${randomUUID()}` });
    c.fonte.publicar('LinxMovimentoDevolucoesItens', CNPJ_A, devolucao(a.idExterno, antes(), [item(100)]));
    await c.sync();
    expect(await c.vendasDb()).toBe(0);
    expect(await prisma.vendaAjustePendente.count({ where: { empresaId: c.empresa.id } })).toBe(1);
    c.fonte.publicar('LinxMovimento', CNPJ_A, a);
    await c.sync();
    const v = await prisma.venda.findFirstOrThrow({ where: { empresaId: c.empresa.id }, include: { itens: true } });
    expect(Number(v.itens[0].valorDevolvido)).toBe(100);
    expect(await prisma.vendaAjustePendente.count({ where: { empresaId: c.empresa.id } })).toBe(0);
  });

  it('reconciliação pega o que escapou do incremental (timestamp abaixo do cursor) sem duplicar e sem mexer no cursor', async () => {
    const c = await cenarioLinx();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(100));
    await c.sync();
    const cursorAntes = await c.cursores();
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(55), 1n); // "escapou": timestamp antigo
    await c.sync();
    expect(await c.vendasDb()).toBe(2); // o incremental não vê
    const r = await c.reconciliar(7);
    expect(r.status).toBe('SUCESSO');
    expect(await c.vendasDb()).toBe(3);
    await c.reconciliar(7);
    expect(await c.vendasDb()).toBe(3);
    expect(await c.cursores()).toEqual(cursorAntes);
    const exec = await prisma.integracaoExecucao.findFirstOrThrow({ where: { integracaoId: c.integ.id, tipo: 'RECONCILIACAO' }, orderBy: { iniciadaEm: 'desc' } });
    expect(exec.status).toBe('SUCESSO');
  });

  it('restart com pendentes: reconciliação aplica ajuste pendente quando a venda passa a existir', async () => {
    const c = await cenarioLinx();
    const a = c.v(300);
    c.fonte.publicar('LinxMovimento', CNPJ_A, cancelamento(a.idExterno, antes()));
    await c.sync();
    expect(await prisma.vendaAjustePendente.count({ where: { empresaId: c.empresa.id } })).toBe(1);
    c.fonte.publicar('LinxMovimento', CNPJ_A, a, 1n); // venda chega com timestamp antigo
    await c.reconciliar(7);
    const v = await prisma.venda.findFirstOrThrow({ where: { empresaId: c.empresa.id } });
    expect(v.status).toBe('CANCELADA');
  });
});

describe('concorrência e produção', () => {
  it('dois workers na mesma integração ao mesmo tempo: um executa, o outro é ignorado; sem duplicar venda nem recompensa', async () => {
    const c = await cenarioLinx({ metaMensal: 3000 });
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(105));
    const [r1, r2] = await Promise.all([c.sync(), c.sync()]);
    const status = [r1.status, r2.status].sort();
    expect(status).toEqual(['IGNORADA', 'SUCESSO']);
    expect(await c.vendasDb()).toBe(1);
    expect(await getTotalXp(c.vendedor.id)).toBe(100);
    expect((await prisma.integracao.findUniqueOrThrow({ where: { id: c.integ.id } })).syncTravadaPor).toBeNull();
  });

  it('trava expirada (processo morreu segurando): a próxima execução assume', async () => {
    const c = await cenarioLinx();
    await prisma.integracao.update({ where: { id: c.integ.id }, data: { syncTravadaAte: new Date(Date.now() - 60_000), syncTravadaPor: 'processo-morto' } });
    c.fonte.publicar('LinxMovimento', CNPJ_A, c.v(10));
    expect((await c.sync()).status).toBe('SUCESSO');
  });

  it('MOCK e CONTROLADO são recusados em produção (sync e reconciliação)', async () => {
    const c = await criarCenarioFase1({ mes: mes() }); // integração CONTROLADO ativa
    const original = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = 'production';
    try {
      expect((await sincronizarIntegracao(c.integracao.id)).status).toBe('ERRO');
      expect((await reconciliarIntegracao(c.integracao.id)).status).toBe('ERRO');
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = original;
    }
  });
});
