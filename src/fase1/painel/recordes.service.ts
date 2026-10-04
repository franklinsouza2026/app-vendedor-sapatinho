// Recordes pessoais (D5) — só os homologados, só com dado real do backend.
// Recorde de dia/mês considera período FECHADO (o de hoje/este mês aparece
// como "em disputa" no campo `atual`).
import { prisma } from '../../db';
import { diaLocal, instanteDoDia, mesLocal, paraDate, somarDias, ultimoDiaDoMes } from '../../tempo/dia';
import { efetivoDaVenda } from '../vendas/agregado.service';
import { calcularSequencia, serieDoVendedor } from '../reconciliacao/motor';
import { metasDoMesEmLote } from '../metas.service';

export interface Recorde {
  tipo: 'MELHOR_DIA' | 'MELHOR_MES' | 'MAIOR_TICKET' | 'MELHOR_PA' | 'MAIOR_SEQUENCIA' | 'MELHOR_POSICAO' | 'MAIOR_PERCENTUAL';
  titulo: string;
  unidade: 'reais' | 'pa' | 'dias' | 'posicao' | 'percentual';
  valor: number;
  quando: string;
  atual: number | null;
}

const JANELA_DIAS = 400;

export async function recordesDoVendedor(vendedorId: string, tz: string, agora: Date): Promise<Recorde[]> {
  const hoje = diaLocal(agora, tz);
  const mesAtual = mesLocal(agora, tz);
  const serie = await serieDoVendedor(vendedorId, somarDias(hoje, -JANELA_DIAS), hoje, tz);
  const recordes: Recorde[] = [];

  const fechados = serie.filter((d) => d.dia < hoje && d.vendas > 0);
  const hojeFat = serie.find((d) => d.dia === hoje)?.faturamento ?? 0;
  if (fechados.length) {
    const melhor = fechados.reduce((a, b) => (b.faturamento > a.faturamento ? b : a));
    recordes.push({ tipo: 'MELHOR_DIA', titulo: 'Melhor dia', unidade: 'reais', valor: melhor.faturamento, quando: melhor.dia, atual: Math.round(hojeFat * 100) / 100 });
  }

  const porMes = new Map<string, { fat: number; vendas: number; pares: number }>();
  for (const d of serie) {
    const m = d.dia.slice(0, 7);
    const x = porMes.get(m) ?? { fat: 0, vendas: 0, pares: 0 };
    porMes.set(m, { fat: x.fat + d.faturamento, vendas: x.vendas + d.vendas, pares: x.pares + d.pares });
  }
  const mesesFechados = [...porMes.entries()].filter(([m, x]) => m < mesAtual && x.vendas > 0);
  if (mesesFechados.length) {
    const [mes, x] = mesesFechados.reduce((a, b) => (b[1].fat > a[1].fat ? b : a));
    recordes.push({ tipo: 'MELHOR_MES', titulo: 'Melhor mês', unidade: 'reais', valor: Math.round(x.fat * 100) / 100, quando: ultimoDiaDoMes(mes), atual: Math.round((porMes.get(mesAtual)?.fat ?? 0) * 100) / 100 });
    const [mesPa, xPa] = mesesFechados.reduce((a, b) => (b[1].pares / b[1].vendas > a[1].pares / a[1].vendas ? b : a));
    recordes.push({ tipo: 'MELHOR_PA', titulo: 'Melhor PA no mês', unidade: 'pa', valor: Math.round((xPa.pares / xPa.vendas) * 100) / 100, quando: ultimoDiaDoMes(mesPa), atual: null });

    const metas = new Map<string, number | null>();
    for (const [m] of mesesFechados) metas.set(m, (await metasDoMesEmLote([vendedorId], m, tz)).get(vendedorId)?.mensal ?? null);
    const comMeta = mesesFechados.filter(([m]) => metas.get(m));
    if (comMeta.length) {
      const [mesPct, xPct] = comMeta.reduce((a, b) => (b[1].fat / metas.get(b[0])! > a[1].fat / metas.get(a[0])! ? b : a));
      recordes.push({ tipo: 'MAIOR_PERCENTUAL', titulo: 'Maior % de meta no mês', unidade: 'percentual', valor: Math.round((xPct.fat / metas.get(mesPct)!) * 1000) / 10, quando: ultimoDiaDoMes(mesPct), atual: null });
    }
  }

  // Maior venda (ticket de UMA venda), descontando devolução.
  const maiores = await prisma.venda.findMany({ where: { vendedorId, status: 'VALIDA', dia: { lt: paraDate(hoje) } }, orderBy: { valor: 'desc' }, take: 20, include: { itens: true } });
  const maior = maiores.map((v) => ({ v, e: efetivoDaVenda(v) })).filter((x) => x.e.vendas > 0).sort((a, b) => b.e.faturamento - a.e.faturamento)[0];
  if (maior) recordes.push({ tipo: 'MAIOR_TICKET', titulo: 'Maior venda', unidade: 'reais', valor: maior.e.faturamento, quando: maior.v.dia.toISOString().slice(0, 10), atual: null });

  const seq = calcularSequencia(serie, hoje);
  if (seq.maior > 0) {
    const diaMaior = seq.conquistas.length ? seq.conquistas[seq.conquistas.length - 1].dia : hoje;
    recordes.push({ tipo: 'MAIOR_SEQUENCIA', titulo: 'Maior sequência de meta', unidade: 'dias', valor: seq.maior, quando: diaMaior, atual: seq.atual });
  }

  const posicoes = await prisma.rankingSnapshot.findMany({ where: { vendedorId, escopo: 'LOJA', tipo: 'FATURAMENTO', periodo: 'MES', dia: { not: null } }, orderBy: [{ posicao: 'asc' }, { referencia: 'desc' }], take: 1 });
  if (posicoes[0]) recordes.push({ tipo: 'MELHOR_POSICAO', titulo: 'Melhor posição na loja', unidade: 'posicao', valor: posicoes[0].posicao, quando: posicoes[0].dia!.toISOString().slice(0, 10), atual: null });

  return recordes;
}

/** Histórico dos últimos meses fechados (MesHistorico homologado). */
export async function historicoMensal(vendedorId: string, tz: string, agora: Date, meses = 6) {
  const hoje = diaLocal(agora, tz);
  const mesAtual = mesLocal(agora, tz);
  const serie = await serieDoVendedor(vendedorId, somarDias(hoje, -(meses + 1) * 31), hoje, tz);
  const porMes = new Map<string, { fat: number; vendas: number; pares: number }>();
  for (const d of serie) {
    if (d.dia.slice(0, 7) >= mesAtual) continue;
    const m = d.dia.slice(0, 7);
    const x = porMes.get(m) ?? { fat: 0, vendas: 0, pares: 0 };
    porMes.set(m, { fat: x.fat + d.faturamento, vendas: x.vendas + d.vendas, pares: x.pares + d.pares });
  }
  const lista = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-meses);
  const saida = [];
  for (const [mes, x] of lista) {
    const meta = (await metasDoMesEmLote([vendedorId], mes, tz)).get(vendedorId)?.mensal ?? 0;
    saida.push({ mes, faturamento: Math.round(x.fat * 100) / 100, meta, ticketMedio: x.vendas ? Math.round((x.fat / x.vendas) * 100) / 100 : 0, pa: x.vendas ? Math.round((x.pares / x.vendas) * 100) / 100 : 0, vendas: x.vendas });
  }
  return saida;
}

export { instanteDoDia };
