// Metas da Fase 1 (D6/D10) — FONTE ÚNICA da meta diária.
//
//   meta diária = meta MENSAL ÷ DIAS PREVISTOS de trabalho do vendedor no mês
//
// Determinística, centralizada no backend, sem cadastro manual diário. Sem
// meta mensal ou sem dias previstos → não há meta diária (null) e o Admin vê a
// pendência. Domingo não é excluído: quem decide quantos dias o vendedor
// trabalha é o Admin (DiasTrabalhoMes), não um calendário inventado.
//
// "Dias trabalhados" = dias do mês com pelo menos uma venda válida (fato do
// ERP). "Dias restantes depois de hoje" = max(0, previstos − trabalhados até
// ontem − 1 [hoje]).
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { instanteDoDia, primeiroDiaDoMes, somarDias, ultimoDiaDoMes } from '../tempo/dia';

export function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Regra pura (testada isoladamente): mensal ÷ dias, em centavos. */
export function calcularMetaDiaria(metaMensal: number | null, diasPrevistos: number | null): number | null {
  if (metaMensal === null || metaMensal <= 0 || !diasPrevistos || diasPrevistos <= 0) return null;
  return arredondarCentavos(metaMensal / diasPrevistos);
}

/** Regra pura: dias de trabalho previstos que sobram DEPOIS de hoje. */
export function calcularDiasRestantes(diasPrevistos: number | null, trabalhadosAteOntem: number): number | null {
  if (!diasPrevistos || diasPrevistos <= 0) return null;
  return Math.max(0, diasPrevistos - trabalhadosAteOntem - 1);
}

export async function metaMensal(vendedorId: string, mes: string, tz: string): Promise<number | null> {
  const meta = await prisma.meta.findUnique({
    where: { vendedorId_tipo_periodo_referencia: { vendedorId, tipo: 'FATURAMENTO', periodo: 'MES', referencia: instanteDoDia(primeiroDiaDoMes(mes), tz) } },
  });
  return meta ? Number(meta.valorMeta) : null;
}

export async function diasPrevistos(vendedorId: string, mes: string): Promise<number | null> {
  const linha = await prisma.diasTrabalhoMes.findUnique({ where: { vendedorId_mes: { vendedorId, mes } } });
  return linha ? linha.dias : null;
}

export async function metaDiariaDerivada(vendedorId: string, mes: string, tz: string): Promise<number | null> {
  const [mensal, dias] = await Promise.all([metaMensal(vendedorId, mes, tz), diasPrevistos(vendedorId, mes)]);
  return calcularMetaDiaria(mensal, dias);
}

export interface MetasDoMes {
  mensal: number | null;
  diasPrevistos: number | null;
  diaria: number | null;
}

/** Versão em lote (1 query por tabela) — usada por ranking, painel e Admin. */
export async function metasDoMesEmLote(vendedorIds: string[], mes: string, tz: string): Promise<Map<string, MetasDoMes>> {
  const resultado = new Map<string, MetasDoMes>(vendedorIds.map((id) => [id, { mensal: null, diasPrevistos: null, diaria: null }]));
  if (vendedorIds.length === 0) return resultado;
  const [metas, dias] = await Promise.all([
    prisma.meta.findMany({ where: { vendedorId: { in: vendedorIds }, tipo: 'FATURAMENTO', periodo: 'MES', referencia: instanteDoDia(primeiroDiaDoMes(mes), tz) }, select: { vendedorId: true, valorMeta: true } }),
    prisma.diasTrabalhoMes.findMany({ where: { vendedorId: { in: vendedorIds }, mes }, select: { vendedorId: true, dias: true } }),
  ]);
  for (const m of metas) resultado.get(m.vendedorId)!.mensal = Number(m.valorMeta);
  for (const d of dias) resultado.get(d.vendedorId)!.diasPrevistos = d.dias;
  for (const r of resultado.values()) r.diaria = calcularMetaDiaria(r.mensal, r.diasPrevistos);
  return resultado;
}

/** Dias do mês (até `ateDia`, inclusive) com ao menos uma venda válida — por vendedor. */
export async function diasTrabalhadosEmLote(vendedorIds: string[], mes: string, ateDia: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>(vendedorIds.map((id) => [id, 0]));
  if (vendedorIds.length === 0 || ateDia < primeiroDiaDoMes(mes)) return mapa;
  const fim = ateDia < ultimoDiaDoMes(mes) ? ateDia : ultimoDiaDoMes(mes);
  const linhas = await prisma.$queryRaw<{ vendedorId: string; dias: bigint }[]>`
    SELECT "vendedorId", COUNT(DISTINCT "dia")::bigint AS dias
    FROM "venda"
    WHERE "vendedorId" IN (${Prisma.join(vendedorIds)})
      AND "status" = 'VALIDA'
      AND "dia" >= ${new Date(`${primeiroDiaDoMes(mes)}T00:00:00Z`)}::date
      AND "dia" <= ${new Date(`${fim}T00:00:00Z`)}::date
    GROUP BY "vendedorId"`;
  for (const l of linhas) mapa.set(l.vendedorId, Number(l.dias));
  return mapa;
}

/** Dias trabalhados até ONTEM (dia local) — base dos dias restantes. */
export async function diasTrabalhadosAteOntem(vendedorId: string, mes: string, hoje: string): Promise<number> {
  const mapa = await diasTrabalhadosEmLote([vendedorId], mes, somarDias(hoje, -1));
  return mapa.get(vendedorId) ?? 0;
}
