// Competições da Fase 1 — COMPLETAM o modelo Competition existente (mesmas
// tabelas, mesmo ciclo DRAFT→SCHEDULED→ACTIVE→FINISHED, mesmo job de
// ativação/finalização, mesmo resultado imutável). O que é da Fase 1:
//   - métricas comerciais calculadas das VENDAS no período (não de snapshot);
//   - escopo TODAS (uma classificação) ou POR_LOJA (cada loja disputa entre si);
//   - Loja × Loja (participante STORE, % da meta coletiva do período);
//   - desempate D9 (métrica → acessos no período → ticket → empate);
//   - prêmios do catálogo (Premio) para o 1º de cada classificação;
//   - privacidade: valor em R$ de colega nunca sai do servidor.
import { calcularPa } from '../indicadores/pa';
import { Competition, Prisma, StatusCompeticao, TipoMetricaCompeticao } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { diaLocal, diasNoMes, listarDias } from '../../tempo/dia';
import { ErroHttp, invalido, naoEncontrado } from '../../utils/erro-http';
import { publicarEventoFeed } from '../../competicoes/feed.service';
import { concederBadge } from '../../gamificacao/badges.service';
import { reconciliarRecompensa } from '../reconciliacao/recompensa';
import { efetivoDaVenda } from '../vendas/agregado.service';
import { metasDoMesEmLote } from '../metas.service';
import { ordenarComDesempate } from '../ranking/ranking.service';
import { descreverPremio, premiosDaEmpresa } from '../incentivos/premios.service';
import { garantirParticipantesInscritos } from '../../competicoes/competitions.service';

export type MetricaCompeticaoFase1 = 'PERCENTUAL_META' | 'EVOLUCAO' | 'SCORE' | 'PA' | 'TICKET' | 'QTD_VENDAS' | 'PARES_CATEGORIA';

const PARA_TIPO: Record<MetricaCompeticaoFase1, TipoMetricaCompeticao> = {
  PERCENTUAL_META: 'GOAL_ATTAINMENT',
  EVOLUCAO: 'PERSONAL_IMPROVEMENT',
  SCORE: 'SCORE_GERAL',
  PA: 'PA',
  TICKET: 'TICKET_MEDIO',
  QTD_VENDAS: 'QTD_VENDAS',
  PARES_CATEGORIA: 'PARES_CATEGORIA',
};
const DE_TIPO = Object.fromEntries(Object.entries(PARA_TIPO).map(([k, v]) => [v, k])) as Partial<Record<TipoMetricaCompeticao, MetricaCompeticaoFase1>>;
const UNIDADE: Record<MetricaCompeticaoFase1, 'vendas' | 'pares' | 'pontos' | 'percentual' | 'pp'> = { PERCENTUAL_META: 'percentual', EVOLUCAO: 'pp', SCORE: 'pontos', PA: 'pontos', TICKET: 'pontos', QTD_VENDAS: 'vendas', PARES_CATEGORIA: 'pares' };
/** Métricas cujo valor é dinheiro — de colega, nunca exposto. */
const FINANCEIRA: Partial<Record<MetricaCompeticaoFase1, boolean>> = { TICKET: true };

export const competicaoEntradaSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  tipo: z.enum(['VENDEDOR', 'LOJA', 'EVOLUCAO', 'CATEGORIA']),
  formato: z.enum(['MENSAL', 'SEMANAL', 'ESPECIAL']),
  metrica: z.enum(['PERCENTUAL_META', 'EVOLUCAO', 'SCORE', 'PA', 'TICKET', 'QTD_VENDAS', 'PARES_CATEGORIA']).nullable(),
  categoria: z.string().trim().max(60).nullable().default(null),
  escopo: z.enum(['TODAS', 'MINHA_LOJA']),
  lojas: z.union([z.literal('TODAS'), z.array(z.string().uuid()).min(1).max(500)]).default('TODAS'),
  regra: z.string().trim().min(1).max(500),
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
  premioIds: z.array(z.string().uuid()).min(1).max(5),
});

const STATUS_CICLO: Record<StatusCompeticao, 'RASCUNHO' | 'PROGRAMADA' | 'ATIVA' | 'ENCERRADA' | 'CANCELADA' | 'ARQUIVADA'> = { DRAFT: 'RASCUNHO', SCHEDULED: 'PROGRAMADA', ACTIVE: 'ATIVA', FINISHED: 'ENCERRADA', CANCELLED: 'CANCELADA', ARCHIVED: 'ARQUIVADA' };

export function ehFase1(c: Pick<Competition, 'tipoExibicao'>) {
  return c.tipoExibicao !== null;
}

export function metricaDe(c: Competition): MetricaCompeticaoFase1 {
  return DE_TIPO[c.metricType] ?? 'PERCENTUAL_META';
}

export function serializarCompeticao(c: Competition) {
  const metrica = c.participantType === 'STORE' ? null : metricaDe(c);
  return {
    id: c.id,
    nome: c.name,
    tipo: c.tipoExibicao,
    formato: c.formato,
    metrica,
    categoria: c.categoria,
    unidade: c.participantType === 'STORE' ? 'pontos' : UNIDADE[metricaDe(c)],
    escopo: c.escopo === 'POR_LOJA' ? 'MINHA_LOJA' : 'TODAS',
    lojas: c.todasLojas ? 'TODAS' : c.lojaIds,
    regra: c.regra ?? c.description,
    inicio: c.startsAt.toISOString(),
    fim: c.endsAt.toISOString(),
    status: STATUS_CICLO[c.status],
    premioIds: c.premioIds,
    canceladaMotivo: c.canceladaMotivo,
  };
}

export async function criarCompeticaoFase1(empresaId: string, atorId: string, entrada: unknown, agora = new Date()) {
  const c = competicaoEntradaSchema.parse(entrada);
  const inicio = new Date(c.inicio);
  const fim = new Date(c.fim);
  if (fim <= inicio) throw invalido('O fim precisa ser depois do início.');
  if (fim.getTime() - inicio.getTime() > 92 * 86_400_000) throw invalido('Uma competição pode durar no máximo 92 dias.');
  if (c.tipo !== 'LOJA' && !c.metrica) throw invalido('Escolha o indicador da disputa.');
  if (c.metrica === 'PARES_CATEGORIA' && !c.categoria) throw invalido('Escolha a categoria.');
  if (c.tipo === 'LOJA' && c.escopo === 'MINHA_LOJA') throw invalido('Loja × Loja não pode ser "cada loja disputa entre si".');
  if (c.lojas !== 'TODAS' && (await prisma.loja.count({ where: { empresaId, id: { in: c.lojas } } })) !== c.lojas.length) throw invalido('Loja fora da empresa.');
  await premiosDaEmpresa(empresaId, c.premioIds);
  const status: StatusCompeticao = inicio > agora ? 'SCHEDULED' : 'ACTIVE';
  const criada = await prisma.competition.create({
    data: {
      empresaId,
      code: `f1-${randomUUID()}`,
      name: c.nome,
      description: c.regra,
      participantType: c.tipo === 'LOJA' ? 'STORE' : 'SELLER',
      metricType: c.tipo === 'LOJA' ? 'GOAL_ATTAINMENT' : PARA_TIPO[c.metrica!],
      status,
      startsAt: inicio,
      endsAt: fim,
      minDiasAtivos: 0,
      escopo: c.escopo === 'MINHA_LOJA' ? 'POR_LOJA' : 'TODAS',
      todasLojas: c.lojas === 'TODAS',
      lojaIds: c.lojas === 'TODAS' ? [] : c.lojas,
      tipoExibicao: c.tipo,
      formato: c.formato,
      regra: c.regra,
      categoria: c.categoria,
      premioIds: c.premioIds,
      createdBy: atorId,
    },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'COMPETITION_CREATED', actorId: atorId, metadata: { competitionId: criada.id, nome: criada.name, status } });
  if (status === 'ACTIVE') {
    await garantirParticipantesInscritos(criada.id, atorId);
    await publicarEventoFeed({ empresaId, eventType: 'COMPETITION_STARTED', sourceType: 'COMPETITION', sourceId: criada.id, visibility: 'COMPANY', templateData: { competitionName: criada.name } });
  }
  return serializarCompeticao(criada);
}

// ------------------------------------------------------------------ cálculo

interface ValorParticipante {
  id: string;
  valor: number | null;
  acessos: number;
  ticket: number;
}

/** Meta proporcional ao período: Σ meta mensal × (dias do período no mês ÷ dias do mês). */
function metaDoPeriodo(diasPorMes: Map<string, number>, metasPorMes: Map<string, number | null>): number | null {
  let total = 0;
  let algum = false;
  for (const [mes, dias] of diasPorMes) {
    const m = metasPorMes.get(mes);
    if (m) {
      total += m * (dias / diasNoMes(mes));
      algum = true;
    }
  }
  return algum ? total : null;
}

async function totaisNoIntervalo(vendedorIds: string[], inicio: Date, fim: Date, categoria: string | null) {
  const vendas = await prisma.venda.findMany({ where: { vendedorId: { in: vendedorIds }, ocorridoEm: { gte: inicio, lte: fim } }, include: { itens: true } });
  const cat = (categoria ?? '').trim().toLocaleLowerCase('pt-BR');
  const t = new Map(vendedorIds.map((id) => [id, { faturamento: 0, vendas: 0, pecas: 0, pares: 0, paresCategoria: 0 }]));
  for (const v of vendas) {
    const e = efetivoDaVenda(v);
    const x = t.get(v.vendedorId)!;
    x.faturamento += e.faturamento;
    x.vendas += e.vendas;
    x.pecas += e.pecas;
    x.pares += e.pares;
    if (cat && v.status !== 'CANCELADA') x.paresCategoria += v.itens.filter((i) => (i.categoria ?? '').trim().toLocaleLowerCase('pt-BR') === cat).reduce((a, i) => a + i.pares - i.paresDevolvidos, 0);
  }
  return t;
}

async function metasNoIntervalo(vendedorIds: string[], inicio: Date, fim: Date, tz: string) {
  const dias = listarDias(diaLocal(inicio, tz), diaLocal(fim, tz));
  const diasPorMes = new Map<string, number>();
  for (const d of dias) diasPorMes.set(d.slice(0, 7), (diasPorMes.get(d.slice(0, 7)) ?? 0) + 1);
  const porVendedor = new Map<string, Map<string, number | null>>(vendedorIds.map((id) => [id, new Map()]));
  for (const mes of diasPorMes.keys()) {
    const metas = await metasDoMesEmLote(vendedorIds, mes, tz);
    for (const [id, m] of metas) porVendedor.get(id)!.set(mes, m.mensal);
  }
  return new Map(vendedorIds.map((id) => [id, metaDoPeriodo(diasPorMes, porVendedor.get(id)!)]));
}

async function acessosNoIntervalo(vendedorIds: string[], inicio: Date, fim: Date, tz: string) {
  const r = await prisma.acessoDiario.groupBy({ by: ['vendedorId'], where: { vendedorId: { in: vendedorIds }, dia: { gte: new Date(`${diaLocal(inicio, tz)}T00:00:00Z`), lte: new Date(`${diaLocal(fim, tz)}T00:00:00Z`) } }, _sum: { quantidadeAcessos: true } });
  return new Map(r.map((x) => [x.vendedorId, x._sum.quantidadeAcessos ?? 0]));
}

/** Valores dos vendedores na competição até `ate`. */
async function valoresVendedores(c: Competition, vendedorIds: string[], ate: Date, tz: string): Promise<ValorParticipante[]> {
  const fim = ate < c.endsAt ? ate : c.endsAt;
  const metrica = metricaDe(c);
  const [totais, acessos] = await Promise.all([totaisNoIntervalo(vendedorIds, c.startsAt, fim, c.categoria), acessosNoIntervalo(vendedorIds, c.startsAt, fim, tz)]);
  let metas: Map<string, number | null> | null = null;
  let metasAnt: Map<string, number | null> | null = null;
  let totaisAnt: Awaited<ReturnType<typeof totaisNoIntervalo>> | null = null;
  if (metrica === 'PERCENTUAL_META' || metrica === 'EVOLUCAO' || metrica === 'SCORE') metas = await metasNoIntervalo(vendedorIds, c.startsAt, fim, tz);
  if (metrica === 'EVOLUCAO' || metrica === 'SCORE') {
    const duracao = fim.getTime() - c.startsAt.getTime();
    const iniAnt = new Date(c.startsAt.getTime() - duracao - 1);
    const fimAnt = new Date(c.startsAt.getTime() - 1);
    [totaisAnt, metasAnt] = await Promise.all([totaisNoIntervalo(vendedorIds, iniAnt, fimAnt, null), metasNoIntervalo(vendedorIds, iniAnt, fimAnt, tz)]);
  }
  return vendedorIds.map((id) => {
    const t = totais.get(id)!;
    const ticket = t.vendas > 0 ? t.faturamento / t.vendas : 0;
    const pct = metas?.get(id) ? (t.faturamento / metas.get(id)!) * 100 : null;
    const ta = totaisAnt?.get(id);
    const pctAnt = ta && metasAnt?.get(id) ? (ta.faturamento / metasAnt.get(id)!) * 100 : null;
    let valor: number | null = null;
    switch (metrica) {
      case 'PERCENTUAL_META':
        valor = pct === null ? null : Math.round(pct * 10) / 10;
        break;
      case 'EVOLUCAO':
        valor = pct !== null && pctAnt !== null ? Math.round((pct - pctAnt) * 10) / 10 : null;
        break;
      case 'SCORE': {
        // Score do período (mesma escala 0–1000 do Score Geral): meta 60%, evolução 40%.
        const meta = pct === null ? 0 : Math.min(100, pct);
        const evol = pct !== null && pctAnt !== null ? Math.max(0, Math.min(100, 50 + (pct - pctAnt))) : 50;
        valor = Math.round((meta * 0.6 + evol * 0.4) * 10);
        break;
      }
      case 'PA':
        valor = calcularPa(t.pecas, t.vendas); // D12: PA = peças por atendimento
        break;
      case 'TICKET':
        valor = t.vendas > 0 ? Math.round(ticket * 100) / 100 : null;
        break;
      case 'QTD_VENDAS':
        valor = t.vendas;
        break;
      case 'PARES_CATEGORIA':
        valor = t.paresCategoria;
        break;
    }
    return { id, valor, acessos: acessos.get(id) ?? 0, ticket };
  });
}

export interface Classificacao {
  grupo: string | null; // lojaId no escopo POR_LOJA
  linhas: { id: string; nome: string; valor: number | null; posicao: number }[];
}

/** Classificação ao vivo (ATIVA) ou congelada (FINISHED). */
export async function classificacao(c: Competition, agora = new Date()): Promise<Classificacao[]> {
  const tz = await timezoneDaEmpresa(c.empresaId);
  const participantes = await prisma.competitionParticipant.findMany({ where: { competitionId: c.id, status: { in: ['ELIGIBLE', 'ACTIVE'] } } });

  if (c.status === 'FINISHED' || c.status === 'ARCHIVED') {
    const resultados = await prisma.competitionResult.findMany({ where: { competitionId: c.id }, orderBy: { rank: 'asc' } });
    const nomes = await nomesDe(c, resultados.map((r) => r.participantId));
    const grupos = await gruposDe(c, resultados.map((r) => r.participantId));
    const porGrupo = new Map<string | null, Classificacao['linhas']>();
    for (const r of resultados) {
      const g = c.escopo === 'POR_LOJA' ? (grupos.get(r.participantId) ?? null) : null;
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), { id: r.participantId, nome: nomes.get(r.participantId) ?? '—', valor: Number(r.score), posicao: r.rank }]);
    }
    return [...porGrupo.entries()].map(([grupo, linhas]) => ({ grupo, linhas }));
  }
  if (c.status !== 'ACTIVE') return [];

  const ids = participantes.map((p) => p.participantId);
  if (c.participantType === 'STORE') {
    const lojasVendedores = await prisma.vendedor.findMany({ where: { lojaId: { in: ids }, papel: 'VENDEDOR', status: 'ACTIVE', elegivelRanking: true }, select: { id: true, lojaId: true } });
    const fim = agora < c.endsAt ? agora : c.endsAt;
    const [totais, metas] = await Promise.all([totaisNoIntervalo(lojasVendedores.map((v) => v.id), c.startsAt, fim, null), metasNoIntervalo(lojasVendedores.map((v) => v.id), c.startsAt, fim, tz)]);
    const valores: ValorParticipante[] = ids.map((lojaId) => {
      const membros = lojasVendedores.filter((v) => v.lojaId === lojaId);
      const fat = membros.reduce((a, v) => a + totais.get(v.id)!.faturamento, 0);
      const meta = membros.reduce((a, v) => a + (metas.get(v.id) ?? 0), 0);
      return { id: lojaId, valor: meta > 0 ? Math.round((fat / meta) * 1000) / 10 : null, acessos: 0, ticket: 0 };
    });
    const nomes = await nomesDe(c, ids);
    return [{ grupo: null, linhas: ordenar(valores).map((e) => ({ id: e.id, nome: nomes.get(e.id) ?? '—', valor: e.valor, posicao: e.posicao })) }];
  }

  const valores = await valoresVendedores(c, ids, agora, tz);
  const nomes = await nomesDe(c, ids);
  if (c.escopo === 'POR_LOJA') {
    const grupos = await gruposDe(c, ids);
    const porLoja = new Map<string, ValorParticipante[]>();
    for (const v of valores) porLoja.set(grupos.get(v.id) ?? '—', [...(porLoja.get(grupos.get(v.id) ?? '—') ?? []), v]);
    return [...porLoja.entries()].map(([grupo, lista]) => ({ grupo, linhas: ordenar(lista).map((e) => ({ id: e.id, nome: nomes.get(e.id) ?? '—', valor: e.valor, posicao: e.posicao })) }));
  }
  return [{ grupo: null, linhas: ordenar(valores).map((e) => ({ id: e.id, nome: nomes.get(e.id) ?? '—', valor: e.valor, posicao: e.posicao })) }];
}

function ordenar(valores: ValorParticipante[]) {
  const comValor = valores.filter((v): v is ValorParticipante & { valor: number } => v.valor !== null);
  return ordenarComDesempate(comValor.map((v) => ({ id: v.id, valor: v.valor, acessos: v.acessos, ticket: v.ticket })));
}

async function nomesDe(c: Competition, ids: string[]) {
  if (c.participantType === 'STORE') return new Map((await prisma.loja.findMany({ where: { id: { in: ids }, empresaId: c.empresaId }, select: { id: true, nome: true } })).map((l) => [l.id, l.nome]));
  return new Map((await prisma.vendedor.findMany({ where: { id: { in: ids }, empresaId: c.empresaId }, select: { id: true, nome: true } })).map((v) => [v.id, v.nome]));
}

async function gruposDe(c: Competition, ids: string[]) {
  if (c.participantType === 'STORE') return new Map<string, string>();
  return new Map((await prisma.vendedor.findMany({ where: { id: { in: ids }, empresaId: c.empresaId }, select: { id: true, lojaId: true } })).map((v) => [v.id, v.lojaId]));
}

// ------------------------------------------------------------------ finalização

/**
 * Finaliza (ACTIVE→FINISHED) congelando a classificação e premiando o 1º de
 * cada classificação. Mesma garantia do motor legado: transição + resultado
 * na MESMA transação; chamada concorrente ou repetida é idempotente.
 */
export async function finalizarCompeticaoFase1(id: string, atorId?: string, agora = new Date()) {
  const c = await prisma.competition.findUniqueOrThrow({ where: { id } });
  const grupos = await classificacao({ ...c, status: 'ACTIVE' }, agora < c.endsAt ? agora : c.endsAt);
  const commitou = await prisma.$transaction(async (tx) => {
    const r = await tx.competition.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'FINISHED', finalizedAt: agora } });
    if (r.count !== 1) return false;
    for (const g of grupos) {
      for (const l of g.linhas) {
        await tx.competitionResult.create({ data: { competitionId: id, participantType: c.participantType, participantId: l.id, rank: l.posicao, score: l.valor ?? 0, points: Math.max(0, Math.round(l.valor ?? 0)) } });
      }
    }
    return true;
  });
  if (!commitou) {
    const atual = await prisma.competition.findUniqueOrThrow({ where: { id } });
    if (atual.status === 'FINISHED' || atual.status === 'ARCHIVED') return;
    throw new ErroHttp(409, 'invalid_transition', 'Só competição ativa pode ser encerrada.');
  }

  const premios = await prisma.premio.findMany({ where: { id: { in: c.premioIds }, empresaId: c.empresaId } });
  const regra = await prisma.regraGamificacaoVersao.findFirst({ where: { empresaId: c.empresaId, ativo: true }, orderBy: { versao: 'desc' } });
  for (const g of grupos) {
    const vencedores = g.linhas.filter((l) => l.posicao === 1);
    for (const v of vencedores) {
      const beneficiados = c.participantType === 'STORE' ? await prisma.vendedor.findMany({ where: { lojaId: v.id, papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true, lojaId: true } }) : await prisma.vendedor.findMany({ where: { id: v.id }, select: { id: true, lojaId: true } });
      for (const b of beneficiados) {
        for (const p of premios.filter((x) => x.tipo === 'DIGITAL')) {
          await prisma.$transaction(async (db) =>
            reconciliarRecompensa(
              db,
              { empresaId: c.empresaId, lojaId: b.lojaId, vendedorId: b.id, tipoEvento: 'COMPETICAO', referenciaTipo: 'COMPETICAO_PREMIO', referenciaId: `${id}:${p.id}`, prefixoChave: `competicao-${id}-${p.id}-${b.id}`, regraVersao: regra?.versao ?? 1, ocorridoEm: agora },
              true,
              { xp: p.xp, moedas: p.moedas }
            )
          );
          if (p.badgeCodigo) await concederBadge(c.empresaId, b.lojaId, b.id, p.badgeCodigo, `badge-competicao-${id}-${p.id}-${b.id}`);
        }
        await prisma.competitionResult.updateMany({ where: { competitionId: id, participantId: v.id }, data: { rewardGranted: premios.length > 0 } });
      }
      await publicarEventoFeed({
        empresaId: c.empresaId,
        eventType: c.participantType === 'STORE' ? 'STORE_LEAD' : 'COMPETITION_WON',
        sourceType: 'COMPETITION_RESULT',
        sourceId: `${id}:${v.id}`,
        visibility: 'COMPANY',
        subjectId: c.participantType === 'STORE' ? undefined : v.id,
        lojaId: c.participantType === 'STORE' ? v.id : undefined,
        templateData: c.participantType === 'STORE' ? { lojaNome: v.nome, competitionName: c.name } : { competitionName: c.name },
      });
    }
  }
  await registrarEventoAuditoria({ empresaId: c.empresaId, acao: 'COMPETITION_FINISHED', actorId: atorId, metadata: { competitionId: id, vencedores: grupos.map((g) => g.linhas.filter((l) => l.posicao === 1).map((l) => l.id)) } });
  if (premios.some((p) => p.tipo === 'DIGITAL')) await registrarEventoAuditoria({ empresaId: c.empresaId, acao: 'COMPETITION_REWARD_GRANTED', actorId: atorId, metadata: { competitionId: id } });
}

export async function buscarCompeticao(empresaId: string, id: string) {
  const c = await prisma.competition.findFirst({ where: { id, empresaId } });
  if (!c) throw naoEncontrado('competição');
  return c;
}

export async function listarCompeticoesFase1(empresaId: string) {
  return (await prisma.competition.findMany({ where: { empresaId, tipoExibicao: { not: null } }, orderBy: { startsAt: 'desc' } })).map(serializarCompeticao);
}

export async function transicionarCompeticaoFase1(empresaId: string, atorId: string, id: string, acao: 'encerrar' | 'cancelar' | 'arquivar', motivo?: string, agora = new Date()) {
  const c = await buscarCompeticao(empresaId, id);
  if (acao === 'encerrar') {
    if (c.status !== 'ACTIVE') throw new ErroHttp(409, 'invalid_transition', 'Só competição ativa pode ser encerrada.');
    await finalizarCompeticaoFase1(id, atorId, agora);
  } else if (acao === 'cancelar') {
    if (!motivo || motivo.trim().length < 5) throw invalido('Motivo do cancelamento é obrigatório (mínimo 5 caracteres).');
    const r = await prisma.competition.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'ACTIVE'] } }, data: { status: 'CANCELLED', canceladaMotivo: motivo.trim() } });
    if (r.count !== 1) throw new ErroHttp(409, 'invalid_transition', 'Competição não pode ser cancelada neste estado.');
    await registrarEventoAuditoria({ empresaId, acao: 'COMPETITION_CANCELLED', actorId: atorId, metadata: { competitionId: id, motivo: motivo.trim() } });
  } else {
    const r = await prisma.competition.updateMany({ where: { id, status: 'FINISHED' }, data: { status: 'ARCHIVED', archivedAt: agora } });
    if (r.count !== 1) throw new ErroHttp(409, 'invalid_transition', 'Só competição encerrada pode ser arquivada.');
    await registrarEventoAuditoria({ empresaId, acao: 'COMPETITION_ARCHIVED', actorId: atorId, metadata: { competitionId: id } });
  }
  return serializarCompeticao(await buscarCompeticao(empresaId, id));
}

/** Formato `Competicao` homologado, do ponto de vista do vendedor (privacidade aplicada). */
export async function competicoesDoVendedor(empresaId: string, vendedorId: string, lojaId: string, agora = new Date()) {
  const lista = await prisma.competition.findMany({
    where: { empresaId, tipoExibicao: { not: null }, status: { in: ['ACTIVE', 'SCHEDULED', 'FINISHED'] }, OR: [{ todasLojas: true }, { lojaIds: { has: lojaId } }], endsAt: { gte: new Date(agora.getTime() - 45 * 86_400_000) } },
    orderBy: { startsAt: 'desc' },
  });
  const premiosTodos = await prisma.premio.findMany({ where: { empresaId, id: { in: [...new Set(lista.flatMap((c) => c.premioIds))] } } });
  const saida = [];
  for (const c of lista) {
    const grupos = c.status === 'SCHEDULED' ? [] : await classificacao(c, agora);
    const meuId = c.participantType === 'STORE' ? lojaId : vendedorId;
    const grupo = c.escopo === 'POR_LOJA' ? grupos.find((g) => g.grupo === lojaId) : grupos[0];
    const financeira = c.participantType === 'SELLER' && FINANCEIRA[metricaDe(c)];
    saida.push({
      id: c.id,
      nome: c.name,
      tipo: c.tipoExibicao,
      formato: c.formato ?? 'ESPECIAL',
      unidade: c.participantType === 'STORE' ? 'pontos' : UNIDADE[metricaDe(c)],
      regra: c.regra ?? c.description,
      iniciaEm: c.startsAt.toISOString(),
      terminaEm: c.endsAt.toISOString(),
      status: c.status === 'ACTIVE' ? 'ATIVA' : c.status === 'SCHEDULED' ? 'PROXIMA' : 'ENCERRADA',
      premio: premiosTodos.filter((p) => c.premioIds.includes(p.id)).map((p) => descreverPremio(p)).join(' + ') || 'Sem prêmio definido',
      participantes: (grupo?.linhas ?? []).map((l) => ({ id: l.id, nome: l.nome, posicao: l.posicao, valor: financeira && l.id !== meuId ? null : l.valor })),
      meuId,
    });
  }
  return saida;
}

/** Garante que competições ativas de Fase 1 têm todos os participantes (vendedor novo/ativado entra). */
export async function garantirParticipantesFase1(empresaId: string) {
  const ativas = await prisma.competition.findMany({ where: { empresaId, status: 'ACTIVE', tipoExibicao: { not: null } }, select: { id: true } });
  for (const c of ativas) await garantirParticipantesInscritos(c.id);
}

export type { Prisma };
