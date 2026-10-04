import { PeriodoMeta, TipoMeta } from '@prisma/client';
import { TZ_PADRAO, diaLocal, diaDaSemana, inicioDoDiaLocal, instanteDoDia, mesLocal, somarDias } from '../tempo/dia';
import { prisma } from '../db';
import { timezoneDaEmpresa } from '../tempo/empresa';
import { metaDiariaDerivada, metasDoMesEmLote } from '../fase1/metas.service';

// PREMISSA A VALIDAR contra o contrato real do Linx (ver TODO em linx-client.ts):
// cada `indicador_realizado` representa o "acumulado do dia até aquela hora"
// (padrão comum em ERPs de varejo), não um incremento isolado daquela hora.
// Por isso o realizado do dia é o snapshot mais recente do dia, e o realizado
// da semana/mês é a soma dos "fechamentos" (snapshot mais recente de cada dia).

// Fase 1 (convergência): o "dia" é SEMPRE o dia local do fuso da empresa
// (src/tempo). Antes usava `setHours(0)` = fuso do PROCESSO — num container
// em UTC, 21h de Pernambuco virava "amanhã". O parâmetro `tz` tem padrão
// Brasília (fuso de todas as empresas existentes); o caminho da Fase 1 passa
// o fuso da empresa explicitamente.
export function inicioDoDia(data: Date, tz: string = TZ_PADRAO): Date {
  return inicioDoDiaLocal(data, tz);
}

/** Data no formato YYYY-MM-DD (dia LOCAL) — usado em idempotencyKeys em vários módulos de gamificação. */
export function dataISO(data: Date, tz: string = TZ_PADRAO): string {
  return diaLocal(data, tz);
}

/** Domingo da semana (convenção legada de metas SEMANA). */
export function inicioDaSemana(data: Date, tz: string = TZ_PADRAO): Date {
  const dia = diaLocal(data, tz);
  const domingo = somarDias(dia, -(diaDaSemana(dia) % 7));
  return instanteDoDia(domingo, tz);
}

export function inicioDoMes(data: Date, tz: string = TZ_PADRAO): Date {
  return instanteDoDia(`${mesLocal(data, tz)}-01`, tz);
}

export async function realizadoNoPeriodo(vendedorId: string, desde: Date, ate: Date, tz: string = TZ_PADRAO) {
  const snapshots = await prisma.indicadorRealizado.findMany({
    where: { vendedorId, dataHora: { gte: desde, lte: ate } },
    orderBy: { dataHora: 'asc' },
  });

  // agrupa por dia e pega o último snapshot de cada dia (fechamento do dia)
  const fechamentoPorDia = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const chave = dataISO(s.dataHora, tz);
    fechamentoPorDia.set(chave, s); // como está em ordem asc, o último grava por cima
  }

  let faturamento = 0;
  let numAtendimentos = 0;
  let somaPaPonderada = 0;

  for (const s of fechamentoPorDia.values()) {
    faturamento += Number(s.faturamento);
    numAtendimentos += s.numAtendimentos;
    somaPaPonderada += Number(s.pa) * s.numAtendimentos;
  }

  const ticketMedio = numAtendimentos > 0 ? faturamento / numAtendimentos : 0;
  const pa = numAtendimentos > 0 ? somaPaPonderada / numAtendimentos : 0;

  return { faturamento, ticketMedio, pa, numAtendimentos };
}

/**
 * Hora do último snapshot do ERP para este vendedor (Fatia 9.7, P1).
 *
 * A Home mostrava "Dados atualizados às X" usando o relógio do NAVEGADOR no
 * momento do fetch — ou seja, um dado de 59 minutos atrás aparecia como
 * "atualizado agora". Isto devolve o frescor REAL. Null quando ainda não houve
 * nenhuma sincronização.
 */
export async function ultimaSincronizacao(vendedorId: string): Promise<Date | null> {
  const ultimo = await prisma.indicadorRealizado.findFirst({
    where: { vendedorId },
    orderBy: { dataHora: 'desc' },
    select: { dataHora: true },
  });
  return ultimo?.dataHora ?? null;
}

export async function metaDoPeriodo(vendedorId: string, tipo: TipoMeta, periodo: PeriodoMeta, referencia: Date) {
  // Fase 1 (D6): meta DIÁRIA de faturamento é DERIVADA (mensal ÷ dias
  // previstos). Linha DIA explícita só vale como legado, quando não há base
  // para derivar — nunca as duas competindo.
  if (tipo === 'FATURAMENTO' && periodo === 'DIA') {
    const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { empresaId: true } });
    if (vendedor) {
      const tz = await timezoneDaEmpresa(vendedor.empresaId);
      const derivada = await metaDiariaDerivada(vendedorId, mesLocal(referencia, tz), tz);
      if (derivada !== null) return derivada;
    }
  }
  const meta = await prisma.meta.findUnique({
    where: { vendedorId_tipo_periodo_referencia: { vendedorId, tipo, periodo, referencia } },
  });
  return meta ? Number(meta.valorMeta) : null;
}

export interface RealizadoAgregado {
  faturamento: number;
  ticketMedio: number;
  pa: number;
  numAtendimentos: number;
}

/**
 * Versão em lote de `realizadoNoPeriodo` (Fatia 9, seção 8/96) — 1 única
 * query pra N vendedores, nunca 1 query por vendedor num loop. Usada pelo
 * Store Summary e pelo Team Overview do gerente, que sempre olham a loja
 * inteira de uma vez.
 */
export async function realizadoNoPeriodoEmLote(vendedorIds: string[], desde: Date, ate: Date): Promise<Map<string, RealizadoAgregado>> {
  if (vendedorIds.length === 0) return new Map();

  const snapshots = await prisma.indicadorRealizado.findMany({
    where: { vendedorId: { in: vendedorIds }, dataHora: { gte: desde, lte: ate } },
    orderBy: { dataHora: 'asc' },
  });

  const porVendedor = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const lista = porVendedor.get(s.vendedorId);
    if (lista) lista.push(s);
    else porVendedor.set(s.vendedorId, [s]);
  }

  const resultado = new Map<string, RealizadoAgregado>();
  for (const vendedorId of vendedorIds) {
    const lista = porVendedor.get(vendedorId) ?? [];
    const fechamentoPorDia = new Map<string, (typeof lista)[number]>();
    for (const s of lista) {
      fechamentoPorDia.set(inicioDoDia(s.dataHora).toISOString(), s);
    }

    let faturamento = 0;
    let numAtendimentos = 0;
    let somaPaPonderada = 0;
    for (const s of fechamentoPorDia.values()) {
      faturamento += Number(s.faturamento);
      numAtendimentos += s.numAtendimentos;
      somaPaPonderada += Number(s.pa) * s.numAtendimentos;
    }

    resultado.set(vendedorId, {
      faturamento,
      ticketMedio: numAtendimentos > 0 ? faturamento / numAtendimentos : 0,
      pa: numAtendimentos > 0 ? somaPaPonderada / numAtendimentos : 0,
      numAtendimentos,
    });
  }

  return resultado;
}

/** Versão em lote de `metaDoPeriodo` — 1 única query pra N vendedores. */
export async function metaDoPeriodoEmLote(vendedorIds: string[], tipo: TipoMeta, periodo: PeriodoMeta, referencia: Date): Promise<Map<string, number>> {
  if (vendedorIds.length === 0) return new Map();
  const metas = await prisma.meta.findMany({ where: { vendedorId: { in: vendedorIds }, tipo, periodo, referencia } });
  const resultado = new Map(metas.map((m) => [m.vendedorId, Number(m.valorMeta)]));
  // Fase 1 (D6): derivada tem precedência sobre a linha DIA legada.
  if (tipo === 'FATURAMENTO' && periodo === 'DIA') {
    const vendedores = await prisma.vendedor.findMany({ where: { id: { in: vendedorIds } }, select: { id: true, empresaId: true } });
    const porEmpresa = new Map<string, string[]>();
    for (const v of vendedores) porEmpresa.set(v.empresaId, [...(porEmpresa.get(v.empresaId) ?? []), v.id]);
    for (const [empresaId, ids] of porEmpresa) {
      const tz = await timezoneDaEmpresa(empresaId);
      const derivadas = await metasDoMesEmLote(ids, mesLocal(referencia, tz), tz);
      for (const [id, m] of derivadas) if (m.diaria !== null) resultado.set(id, m.diaria);
    }
  }
  return resultado;
}

export interface ProgressoPeriodo {
  periodo: 'DIA' | 'SEMANA' | 'MES';
  metaFaturamento: number | null;
  realizado: { faturamento: number; ticketMedio: number; pa: number; numAtendimentos: number };
  faltaParaMeta: number | null;
}

export async function getProgressoVendedor(vendedorId: string, agora: Date = new Date()): Promise<ProgressoPeriodo[]> {
  const janelas: { periodo: PeriodoMeta; desde: Date; referencia: Date }[] = [
    { periodo: 'DIA', desde: inicioDoDia(agora), referencia: inicioDoDia(agora) },
    { periodo: 'SEMANA', desde: inicioDaSemana(agora), referencia: inicioDaSemana(agora) },
    { periodo: 'MES', desde: inicioDoMes(agora), referencia: inicioDoMes(agora) },
  ];

  const resultado: ProgressoPeriodo[] = [];

  for (const janela of janelas) {
    const [realizado, metaFaturamento] = await Promise.all([
      realizadoNoPeriodo(vendedorId, janela.desde, agora),
      metaDoPeriodo(vendedorId, 'FATURAMENTO', janela.periodo, janela.referencia),
    ]);

    resultado.push({
      periodo: janela.periodo,
      metaFaturamento,
      realizado,
      faltaParaMeta: metaFaturamento !== null ? Math.max(0, metaFaturamento - realizado.faturamento) : null,
    });
  }

  return resultado;
}
