// Motor de reconciliação por vendedor (D4) — recalcula TODOS os derivados
// comerciais a partir dos fatos (agregados diários vindos das vendas) e põe
// o ledger, as conquistas e o feed no estado devido. É o mesmo motor para a
// venda que entra e para a venda que é cancelada/devolvida: a correção é só
// "recalcular de novo".
//
// Derivados cobertos:
//   - tiers de meta do dia (100/110/120/150) + feed GOAL_REACHED
//   - melhora de PA / ticket do dia (vs. média pessoal dos 14 dias anteriores)
//   - sequência de meta (dias TRABALHADOS seguidos com meta batida) + limiares 3/5/10
//   - conquistas derivadas (Primeira Meta, 7 dias seguidos, PA Master, Ticket Master)
//   - recorde de melhor dia (feed RECORD_BROKEN, só dia fechado)
//   - missões governadas (src/fase1/missoes) via gancho
//
// Concorrência: tudo roda numa transação com `pg_advisory_xact_lock` do
// vendedor — duas reconciliações do mesmo vendedor (sync + reprocesso, ou duas
// réplicas) são serializadas: uma ocorrência lógica, uma consequência.
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../../db';
import { createLogger } from '../../utils/logger';
import { diaLocal, fimDoDiaLocal, instanteDoDia, listarDias, mesLocal, paraDate, somarDias } from '../../tempo/dia';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { getRegraAtiva, RegraAtiva } from '../../gamificacao/regras.service';
import { publicarEventoFeed, revogarEventoFeed } from '../../competicoes/feed.service';
import { concederBadge, CodigoBadge } from '../../gamificacao/badges.service';
import { metasDoMesEmLote } from '../metas.service';
import { ClienteDb, reconciliarRecompensa, saldoDaReferencia } from './recompensa';

const log = createLogger('fase1:reconciliacao');

export const TIERS_META: { limiar: number; evento: TipoEventoGamificacao }[] = [
  { limiar: 100, evento: 'META_DIARIA_100' },
  { limiar: 110, evento: 'META_DIARIA_110' },
  { limiar: 120, evento: 'META_DIARIA_120' },
  { limiar: 150, evento: 'META_DIARIA_150' },
];
export const LIMIARES_SEQUENCIA: { valor: number; evento: TipoEventoGamificacao }[] = [
  { valor: 3, evento: 'STREAK_3' },
  { valor: 5, evento: 'STREAK_5' },
  { valor: 10, evento: 'STREAK_10' },
];
/** Melhora validada = pelo menos +5% acima da média pessoal (régua v1, mesmo limiar do motor legado). */
export const LIMIAR_MELHORA_PCT = 5;
export const JANELA_BASELINE_DIAS = 14;
export const AMOSTRA_MINIMA_BASELINE = 5;
/** Janela de reconciliação de sequência/recordes (dias para trás a partir de hoje). */
export const JANELA_RECONCILIACAO_DIAS = 120;

export interface DiaSerie {
  dia: string;
  faturamento: number;
  vendas: number;
  pecas: number;
  pares: number;
  ticket: number;
  pa: number;
  meta: number | null;
}

/** Série diária do vendedor (último snapshot de cada dia local) + meta do dia (derivada D6, ou legada). */
export async function serieDoVendedor(vendedorId: string, desde: string, ate: string, tz: string): Promise<DiaSerie[]> {
  const linhas = await prisma.indicadorRealizado.findMany({
    where: { vendedorId, dataHora: { gte: instanteDoDia(desde, tz), lte: fimDoDiaLocal(ate, tz) } },
    orderBy: { dataHora: 'asc' },
  });
  const porDia = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) porDia.set(diaLocal(l.dataHora, tz), l);

  const meses = [...new Set(listarDias(desde, ate).map((d) => d.slice(0, 7)))];
  const metaDiariaPorMes = new Map<string, number | null>();
  for (const mes of meses) metaDiariaPorMes.set(mes, (await metasDoMesEmLote([vendedorId], mes, tz)).get(vendedorId)?.diaria ?? null);
  const legadas = await prisma.meta.findMany({ where: { vendedorId, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: { gte: instanteDoDia(desde, tz), lte: fimDoDiaLocal(ate, tz) } } });
  const legadaPorDia = new Map(legadas.map((m) => [diaLocal(m.referencia, tz), Number(m.valorMeta)]));

  return [...porDia.entries()].map(([dia, l]) => ({
    dia,
    faturamento: Number(l.faturamento),
    vendas: l.numAtendimentos,
    pecas: l.pecas,
    pares: l.pares,
    ticket: Number(l.ticketMedio),
    pa: Number(l.pa),
    meta: metaDiariaPorMes.get(dia.slice(0, 7)) ?? legadaPorDia.get(dia) ?? null,
  }));
}

export function percentualDoDia(d: Pick<DiaSerie, 'faturamento' | 'meta'>): number | null {
  return d.meta && d.meta > 0 ? (d.faturamento / d.meta) * 100 : null;
}

/** Média pessoal dos dias TRABALHADOS nos 14 dias anteriores (exclusive). Pura. */
export function baselineDoDia(serie: DiaSerie[], dia: string): { pa: number | null; ticket: number | null } {
  const inicio = somarDias(dia, -JANELA_BASELINE_DIAS);
  const amostras = serie.filter((d) => d.dia >= inicio && d.dia < dia && d.vendas > 0);
  if (amostras.length < AMOSTRA_MINIMA_BASELINE) return { pa: null, ticket: null };
  return { pa: amostras.reduce((a, d) => a + d.pa, 0) / amostras.length, ticket: amostras.reduce((a, d) => a + d.ticket, 0) / amostras.length };
}

export interface ResultadoSequencia {
  atual: number;
  maior: number;
  /** Limiares atingidos: valor do limiar e o dia em que foi atingido. */
  conquistas: { valor: number; dia: string }[];
}

/**
 * Sequência de meta (pura, testada): dias TRABALHADOS (com venda) consecutivos
 * em que a meta do dia foi batida. Dia sem venda (folga) ou sem meta é neutro:
 * não conta e não quebra. Hoje ainda em andamento só conta se já bateu — nunca
 * quebra a sequência antes de terminar.
 */
export function calcularSequencia(serie: DiaSerie[], hoje: string): ResultadoSequencia {
  let atual = 0;
  let maior = 0;
  const conquistas: { valor: number; dia: string }[] = [];
  for (const d of [...serie].sort((a, b) => a.dia.localeCompare(b.dia))) {
    if (d.vendas <= 0) continue;
    const pct = percentualDoDia(d);
    if (pct === null) continue;
    if (pct >= 100) {
      atual++;
      maior = Math.max(maior, atual);
      for (const l of LIMIARES_SEQUENCIA) if (atual === l.valor) conquistas.push({ valor: l.valor, dia: d.dia });
    } else if (d.dia !== hoje) {
      atual = 0;
    }
  }
  return { atual, maior, conquistas };
}

/** Dias (fechados) em que o vendedor bateu o próprio recorde de faturamento diário. Pura. */
export function diasDeRecorde(serie: DiaSerie[], hoje: string, maximoAnterior: number): string[] {
  let maximo = maximoAnterior;
  let diasComVenda = maximoAnterior > 0 ? 1 : 0;
  const recordes: string[] = [];
  for (const d of [...serie].sort((a, b) => a.dia.localeCompare(b.dia))) {
    if (d.dia >= hoje || d.vendas <= 0) continue;
    if (diasComVenda > 0 && d.faturamento > maximo) recordes.push(d.dia);
    maximo = Math.max(maximo, d.faturamento);
    diasComVenda++;
  }
  return recordes;
}

export interface ResumoReconciliacao {
  vendedorId: string;
  concedidos: TipoEventoGamificacao[];
  revertidos: TipoEventoGamificacao[];
}

type GanchoMissoes = (db: ClienteDb, ctx: ContextoVendedor, diasAfetados: string[]) => Promise<void>;
let ganchoMissoes: GanchoMissoes | null = null;
/** Missões governadas registram aqui o próprio reconciliador (evita import circular). */
export function registrarGanchoMissoes(fn: GanchoMissoes) {
  ganchoMissoes = fn;
}

export interface ContextoVendedor {
  vendedorId: string;
  empresaId: string;
  lojaId: string;
  tz: string;
  hoje: string;
  agora: Date;
  regra: RegraAtiva;
}

async function travarVendedor(db: ClienteDb, vendedorId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reconciliacao:${vendedorId}`}))`;
}

/**
 * Reconcilia o vendedor para os dias afetados (e sequência/conquistas/recordes
 * na janela). Idempotente: chamar N vezes seguidas com os mesmos fatos não
 * muda nada depois da primeira.
 */
export async function reconciliarVendedor(vendedorId: string, diasAfetados: string[], opcoes: { agora?: Date } = {}): Promise<ResumoReconciliacao> {
  const agora = opcoes.agora ?? new Date();
  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { empresaId: true, lojaId: true } });
  const resumo: ResumoReconciliacao = { vendedorId, concedidos: [], revertidos: [] };
  if (!vendedor) return resumo;

  const tz = await timezoneDaEmpresa(vendedor.empresaId);
  let regra: RegraAtiva;
  try {
    regra = await getRegraAtiva(vendedor.empresaId);
  } catch (err) {
    log.warn({ err, vendedorId }, 'empresa sem régua de gamificação ativa — reconciliação adiada');
    return resumo;
  }
  const hoje = diaLocal(agora, tz);
  const dias = [...new Set(diasAfetados)].filter((d) => d <= hoje).sort();
  const inicioJanela = somarDias(hoje, -JANELA_RECONCILIACAO_DIAS);
  const desde = somarDias(dias[0] && dias[0] < inicioJanela ? dias[0] : inicioJanela, -JANELA_BASELINE_DIAS);
  const serie = await serieDoVendedor(vendedorId, desde, hoje, tz);
  const porDia = new Map(serie.map((d) => [d.dia, d]));
  const maximoAntesDaJanela = Number((await prisma.indicadorRealizado.aggregate({ where: { vendedorId, dataHora: { lt: instanteDoDia(inicioJanela, tz) }, numAtendimentos: { gt: 0 } }, _max: { faturamento: true } }))._max.faturamento ?? 0);

  const ctx: ContextoVendedor = { vendedorId, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, tz, hoje, agora, regra };
  const registrar = (desfecho: string, evento: TipoEventoGamificacao) => {
    if (desfecho === 'CONCEDIDA') resumo.concedidos.push(evento);
    if (desfecho === 'REVERTIDA') resumo.revertidos.push(evento);
  };
  const feed: { publicar: Parameters<typeof publicarEventoFeed>[0][]; revogar: [string, string, string][] } = { publicar: [], revogar: [] };

  await prisma.$transaction(
    async (db) => {
      await travarVendedor(db, vendedorId);

      // ---- dia a dia: tiers de meta e melhora
      for (const dia of dias) {
        const d = porDia.get(dia) ?? { dia, faturamento: 0, vendas: 0, pecas: 0, pares: 0, ticket: 0, pa: 0, meta: null };
        const pct = percentualDoDia(d);
        const ocorridoEm = dia === hoje ? agora : fimDoDiaLocal(dia, tz);
        for (const tier of TIERS_META) {
          const devida = pct !== null && pct >= tier.limiar;
          const desfecho = await reconciliarRecompensa(
            db,
            { empresaId: ctx.empresaId, lojaId: ctx.lojaId, vendedorId, tipoEvento: tier.evento, referenciaTipo: 'META_DIARIA_TIER', referenciaId: `${vendedorId}:${dia}:${tier.limiar}`, prefixoChave: `meta-diaria-${tier.limiar}-${vendedorId}-${dia}`, regraVersao: regra.versao, ocorridoEm },
            devida,
            { xp: regra.regrasXp[tier.evento] ?? 0, moedas: regra.regrasMoeda[tier.evento] ?? 0 }
          );
          registrar(desfecho, tier.evento);
          if (tier.limiar === 100) {
            if (devida) feed.publicar.push({ empresaId: ctx.empresaId, eventType: 'GOAL_REACHED', sourceType: 'META_DIARIA_TIER', sourceId: `${vendedorId}:${dia}:100`, visibility: 'STORE', lojaId: ctx.lojaId, subjectId: vendedorId, templateData: {}, ocorridoEm });
            else feed.revogar.push(['GOAL_REACHED', 'META_DIARIA_TIER', `${vendedorId}:${dia}:100`]);
          }
        }

        const base = baselineDoDia(serie, dia);
        for (const [evento, valor, referencia, refTipo, prefixo] of [
          ['MELHORA_PA', d.pa, base.pa, 'BASELINE_PA', `melhora-pa-${vendedorId}-${dia}`],
          ['MELHORA_TICKET', d.ticket, base.ticket, 'BASELINE_TICKET', `melhora-ticket-${vendedorId}-${dia}`],
        ] as const) {
          const devida = d.vendas > 0 && referencia !== null && referencia > 0 && ((valor - referencia) / referencia) * 100 >= LIMIAR_MELHORA_PCT;
          const desfecho = await reconciliarRecompensa(
            db,
            { empresaId: ctx.empresaId, lojaId: ctx.lojaId, vendedorId, tipoEvento: evento, referenciaTipo: refTipo, referenciaId: `${vendedorId}:${dia}`, prefixoChave: prefixo, regraVersao: regra.versao, ocorridoEm },
            devida,
            { xp: regra.regrasXp[evento] ?? 0, moedas: regra.regrasMoeda[evento] ?? 0 }
          );
          registrar(desfecho, evento);
        }
      }

      // ---- sequência de meta (janela inteira — um cancelamento antigo pode quebrar conquistas posteriores)
      const sequencia = calcularSequencia(serie.filter((d) => d.dia >= inicioJanela), hoje);
      const devidas = new Set(sequencia.conquistas.map((c) => `${vendedorId}:${c.valor}:${c.dia}`));
      const existentes = await db.xpTransacao.findMany({ where: { vendedorId, referenciaTipo: 'SEQUENCIA_META', ocorridoEm: { gte: instanteDoDia(inicioJanela, tz) } }, select: { referenciaId: true } });
      const existentesMoeda = await db.moedaTransacao.findMany({ where: { vendedorId, referenciaTipo: 'SEQUENCIA_META', ocorridoEm: { gte: instanteDoDia(inicioJanela, tz) } }, select: { referenciaId: true } });
      const referencias = new Set([...devidas, ...existentes.map((e) => e.referenciaId!), ...existentesMoeda.map((e) => e.referenciaId!)]);
      for (const referenciaId of referencias) {
        const [, valorTxt, dia] = referenciaId.split(':');
        const limiar = LIMIARES_SEQUENCIA.find((l) => l.valor === Number(valorTxt));
        if (!limiar || !dia) continue;
        const desfecho = await reconciliarRecompensa(
          db,
          { empresaId: ctx.empresaId, lojaId: ctx.lojaId, vendedorId, tipoEvento: limiar.evento, referenciaTipo: 'SEQUENCIA_META', referenciaId, prefixoChave: `sequencia-${limiar.valor}-${vendedorId}-${dia}`, regraVersao: regra.versao, ocorridoEm: dia === hoje ? agora : fimDoDiaLocal(dia, tz) },
          devidas.has(referenciaId),
          { xp: regra.regrasXp[limiar.evento] ?? 0, moedas: regra.regrasMoeda[limiar.evento] ?? 0 }
        );
        registrar(desfecho, limiar.evento);
      }

      // ---- recordes de melhor dia (feed, dia fechado)
      const recordes = new Set(diasDeRecorde(serie.filter((d) => d.dia >= inicioJanela), hoje, maximoAntesDaJanela));
      for (const d of serie.filter((x) => x.dia >= inicioJanela && x.dia < hoje)) {
        const sourceId = `${vendedorId}:MELHOR_DIA:${d.dia}`;
        if (recordes.has(d.dia)) feed.publicar.push({ empresaId: ctx.empresaId, eventType: 'RECORD_BROKEN', sourceType: 'RECORDE', sourceId, visibility: 'STORE', lojaId: ctx.lojaId, subjectId: vendedorId, templateData: { recordeTitulo: 'melhor dia de vendas' }, ocorridoEm: fimDoDiaLocal(d.dia, tz) });
        else feed.revogar.push(['RECORD_BROKEN', 'RECORDE', sourceId]);
      }

      // ---- missões governadas
      if (ganchoMissoes) await ganchoMissoes(db, ctx, dias);

      // ---- conquistas derivadas (estado devido a partir do ledger já reconciliado)
      await reconciliarConquistas(db, ctx, sequencia);
    },
    { timeout: 60_000, maxWait: 30_000 }
  );

  for (const [eventType, sourceType, sourceId] of feed.revogar) await revogarEventoFeed(eventType, sourceType, sourceId);
  for (const evento of feed.publicar) await publicarEventoFeed(evento);

  if (resumo.concedidos.length || resumo.revertidos.length) log.info({ vendedorId, dias, concedidos: resumo.concedidos, revertidos: resumo.revertidos }, 'vendedor reconciliado');
  return resumo;
}

/** Conquista devida ↔ concessão ativa. Concede (ou reativa) quando passa a valer; revoga quando deixa de valer. */
async function reconciliarConquistas(db: ClienteDb, ctx: ContextoVendedor, sequencia: ResultadoSequencia) {
  const temCreditoAtivo = async (referenciaTipo: string, sufixo?: string) => {
    const refs = await db.moedaTransacao.findMany({ where: { vendedorId: ctx.vendedorId, referenciaTipo, ...(sufixo ? { referenciaId: { endsWith: sufixo } } : {}) }, select: { referenciaId: true }, distinct: ['referenciaId'] });
    const refsXp = await db.xpTransacao.findMany({ where: { vendedorId: ctx.vendedorId, referenciaTipo, ...(sufixo ? { referenciaId: { endsWith: sufixo } } : {}) }, select: { referenciaId: true }, distinct: ['referenciaId'] });
    for (const r of new Set([...refs, ...refsXp].map((x) => x.referenciaId!))) {
      const saldo = await saldoDaReferencia(db, ctx.vendedorId, referenciaTipo, r);
      if (saldo.xp > 0 || saldo.moeda > 0) return true;
    }
    return false;
  };
  const devidas: { codigo: CodigoBadge; chave: string; devida: boolean }[] = [
    { codigo: 'PRIMEIRA_META', chave: `badge-primeira-meta-${ctx.vendedorId}`, devida: await temCreditoAtivo('META_DIARIA_TIER', ':100') },
    { codigo: 'STREAK_7', chave: `badge-streak-7-${ctx.vendedorId}`, devida: sequencia.maior >= 7 },
    { codigo: 'PA_MASTER', chave: `badge-pa-master-${ctx.vendedorId}`, devida: await temCreditoAtivo('BASELINE_PA') },
    { codigo: 'TICKET_MASTER', chave: `badge-ticket-master-${ctx.vendedorId}`, devida: await temCreditoAtivo('BASELINE_TICKET') },
  ];
  for (const c of devidas) {
    const existente = await db.badgeConcessao.findUnique({ where: { idempotencyKey: c.chave } });
    if (c.devida) {
      if (!existente) await concederBadge(ctx.empresaId, ctx.lojaId, ctx.vendedorId, c.codigo, c.chave);
      else if (existente.revogadoEm) {
        await db.badgeConcessao.update({ where: { id: existente.id }, data: { revogadoEm: null } });
        await prisma.feedEvent.updateMany({ where: { eventType: 'BADGE_EARNED', sourceType: 'BADGE_CONCESSAO', sourceId: existente.id }, data: { revogadoEm: null } });
      }
    } else if (existente && !existente.revogadoEm) {
      // STREAK_7 conquistado fora da janela de reconciliação nunca é revogado.
      if (c.codigo === 'STREAK_7' && existente.concedidoEm < paraDate(somarDias(ctx.hoje, -JANELA_RECONCILIACAO_DIAS))) continue;
      await db.badgeConcessao.update({ where: { id: existente.id }, data: { revogadoEm: new Date() } });
      await revogarEventoFeed('BADGE_EARNED', 'BADGE_CONCESSAO', existente.id);
    }
  }
}

/** Mês corrente de um instante no fuso — atalho usado pelo painel/ranking. */
export function mesCorrente(agora: Date, tz: string) {
  return mesLocal(agora, tz);
}
