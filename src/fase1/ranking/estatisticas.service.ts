// Estatísticas comerciais do mês por vendedor — base ÚNICA de ranking,
// painel do vendedor, Admin (Performance) e competições da Fase 1. Tudo vem
// dos agregados diários (derivados das vendas) + metas derivadas (D6) +
// acessos (D9). Nada aqui é estimado no cliente.
import { prisma } from '../../db';
import { diaLocal, fimDoDiaLocal, instanteDoDia, primeiroDiaDoMes, somarDias, mesAnterior, diasNoMes } from '../../tempo/dia';
import { calcularScoreGeral } from '../../gamificacao/score';
import { PesosScore } from '../../gamificacao/regras.service';
import { metasDoMesEmLote } from '../metas.service';

export interface Totais {
  faturamento: number;
  vendas: number;
  pecas: number;
  pares: number;
}

export interface EstatisticaVendedor {
  vendedorId: string;
  mes: Totais & { diasTrabalhados: number; diasComMetaBatida: number; diasComMeta: number };
  hoje: Totais;
  metaMensal: number | null;
  metaDiaria: number | null;
  diasPrevistos: number | null;
  /** Mesmo intervalo de dias do mês anterior (1 → mesmo dia), para evolução. */
  anterior: Totais & { metaMensal: number | null };
  acessosNoMes: number;
  ticket: number | null;
  pa: number | null;
  percentualMeta: number | null;
  evolucaoPp: number | null;
  consistencia: number;
  score: number;
  scoreProvisorio: boolean;
}

const vazio = (): Totais => ({ faturamento: 0, vendas: 0, pecas: 0, pares: 0 });
const somar = (a: Totais, b: Totais): Totais => ({ faturamento: Math.round((a.faturamento + b.faturamento) * 100) / 100, vendas: a.vendas + b.vendas, pecas: a.pecas + b.pecas, pares: a.pares + b.pares });

/** Série diária (último snapshot de cada dia local) por vendedor no intervalo [desde, ate]. */
export async function diasPorVendedor(vendedorIds: string[], desde: string, ate: string, tz: string): Promise<Map<string, Map<string, Totais>>> {
  const mapa = new Map<string, Map<string, Totais>>(vendedorIds.map((id) => [id, new Map()]));
  if (!vendedorIds.length || ate < desde) return mapa;
  const linhas = await prisma.indicadorRealizado.findMany({
    where: { vendedorId: { in: vendedorIds }, dataHora: { gte: instanteDoDia(desde, tz), lte: fimDoDiaLocal(ate, tz) } },
    orderBy: { dataHora: 'asc' },
    select: { vendedorId: true, dataHora: true, faturamento: true, numAtendimentos: true, pecas: true, pares: true },
  });
  for (const l of linhas) mapa.get(l.vendedorId)!.set(diaLocal(l.dataHora, tz), { faturamento: Number(l.faturamento), vendas: l.numAtendimentos, pecas: l.pecas, pares: l.pares });
  return mapa;
}

function deltaPct(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * Estatísticas do mês `mes` até o dia `ateDia` (inclusive) para os vendedores.
 * `ateDia` = hoje para o "agora"; = ontem para a "posição anterior".
 */
export async function estatisticasDoMes(params: { empresaId: string; vendedorIds: string[]; mes: string; ateDia: string; hoje: string; tz: string; pesos: PesosScore }): Promise<Map<string, EstatisticaVendedor>> {
  const { vendedorIds, mes, ateDia, tz } = params;
  const resultado = new Map<string, EstatisticaVendedor>();
  if (!vendedorIds.length) return resultado;
  const inicio = primeiroDiaDoMes(mes);
  const mesAnt = mesAnterior(mes);
  const diaDoMes = Number(ateDia.slice(8, 10));
  const ateAnterior = `${mesAnt}-${String(Math.min(diaDoMes, diasNoMes(mesAnt))).padStart(2, '0')}`;

  const [dias, diasAnt, metas, metasAnt, acessos] = await Promise.all([
    diasPorVendedor(vendedorIds, inicio, ateDia, tz),
    diasPorVendedor(vendedorIds, primeiroDiaDoMes(mesAnt), ateAnterior, tz),
    metasDoMesEmLote(vendedorIds, mes, tz),
    metasDoMesEmLote(vendedorIds, mesAnt, tz),
    prisma.acessoDiario.groupBy({ by: ['vendedorId'], where: { vendedorId: { in: vendedorIds }, dia: { gte: new Date(`${inicio}T00:00:00Z`), lte: new Date(`${ateDia}T00:00:00Z`) } }, _sum: { quantidadeAcessos: true } }),
  ]);
  const acessosPor = new Map(acessos.map((a) => [a.vendedorId, a._sum.quantidadeAcessos ?? 0]));

  for (const id of vendedorIds) {
    const m = metas.get(id)!;
    const serie = dias.get(id)!;
    let mesTotais = vazio();
    let diasTrabalhados = 0;
    let diasComMeta = 0;
    let diasComMetaBatida = 0;
    for (const [dia, t] of serie) {
      if (dia > ateDia) continue;
      mesTotais = somar(mesTotais, t);
      if (t.vendas > 0) {
        diasTrabalhados++;
        if (m.diaria) {
          diasComMeta++;
          if (t.faturamento >= m.diaria) diasComMetaBatida++;
        }
      }
    }
    const hojeTotais = serie.get(params.hoje) ?? vazio();
    let anterior = vazio();
    for (const t of diasAnt.get(id)!.values()) anterior = somar(anterior, t);
    const metaAnt = metasAnt.get(id)!.mensal;

    const ticket = mesTotais.vendas > 0 ? mesTotais.faturamento / mesTotais.vendas : null;
    // D12: PA = peças por atendimento.
    const pa = mesTotais.vendas > 0 ? mesTotais.pecas / mesTotais.vendas : null;
    const ticketAnt = anterior.vendas > 0 ? anterior.faturamento / anterior.vendas : null;
    const paAnt = anterior.vendas > 0 ? anterior.pecas / anterior.vendas : null;
    const percentualMeta = m.mensal ? (mesTotais.faturamento / m.mensal) * 100 : null;
    const percentualAnt = metaAnt ? (anterior.faturamento / metaAnt) * 100 : null;
    const score = calcularScoreGeral(
      {
        metaPercentual: percentualMeta ?? 0,
        evolucaoDeltaPct: deltaPct(mesTotais.faturamento, anterior.faturamento),
        paDeltaPct: deltaPct(pa, paAnt),
        ticketDeltaPct: deltaPct(ticket, ticketAnt),
        consistenciaPct: diasComMeta > 0 ? (diasComMetaBatida / diasComMeta) * 100 : null,
      },
      params.pesos
    );

    resultado.set(id, {
      vendedorId: id,
      mes: { ...mesTotais, diasTrabalhados, diasComMetaBatida, diasComMeta },
      hoje: hojeTotais,
      metaMensal: m.mensal,
      metaDiaria: m.diaria,
      diasPrevistos: m.diasPrevistos,
      anterior: { ...anterior, metaMensal: metaAnt },
      acessosNoMes: acessosPor.get(id) ?? 0,
      ticket,
      pa,
      percentualMeta,
      evolucaoPp: percentualMeta !== null && percentualAnt !== null ? percentualMeta - percentualAnt : null,
      consistencia: diasComMetaBatida,
      score: score.scoreGeral,
      scoreProvisorio: score.provisorio,
    });
  }
  return resultado;
}

export function ontemDe(hoje: string) {
  return somarDias(hoje, -1);
}
