import { PeriodoMeta, TipoMeta } from '@prisma/client';
import { prisma } from '../db';

// PREMISSA A VALIDAR contra o contrato real do Linx (ver TODO em linx-client.ts):
// cada `indicador_realizado` representa o "acumulado do dia até aquela hora"
// (padrão comum em ERPs de varejo), não um incremento isolado daquela hora.
// Por isso o realizado do dia é o snapshot mais recente do dia, e o realizado
// da semana/mês é a soma dos "fechamentos" (snapshot mais recente de cada dia).

export function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Data no formato YYYY-MM-DD — usado em idempotencyKeys em vários módulos de gamificação. */
export function dataISO(data: Date): string {
  return inicioDoDia(data).toISOString().slice(0, 10);
}

export function inicioDaSemana(data: Date): Date {
  const d = inicioDoDia(data);
  const diaSemana = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - diaSemana);
  return d;
}

export function inicioDoMes(data: Date): Date {
  const d = inicioDoDia(data);
  d.setDate(1);
  return d;
}

export async function realizadoNoPeriodo(vendedorId: string, desde: Date, ate: Date) {
  const snapshots = await prisma.indicadorRealizado.findMany({
    where: { vendedorId, dataHora: { gte: desde, lte: ate } },
    orderBy: { dataHora: 'asc' },
  });

  // agrupa por dia e pega o último snapshot de cada dia (fechamento do dia)
  const fechamentoPorDia = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const chave = inicioDoDia(s.dataHora).toISOString();
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

export async function metaDoPeriodo(vendedorId: string, tipo: TipoMeta, periodo: PeriodoMeta, referencia: Date) {
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
  return new Map(metas.map((m) => [m.vendedorId, Number(m.valorMeta)]));
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
