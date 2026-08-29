// Baseline pessoal (seção 17 da fonte de verdade): "nunca inventar média".
// v1 (decisão explícita, documentada em 05-Decisoes-e-Tradeoffs.md): janela de
// 14 dias fechados anteriores ao dia avaliado, amostra mínima de 5 dias com
// dado disponível. Enquanto não há amostra suficiente, o vendedor fica "em
// formação de baseline" — nunca inventamos uma média com poucos dados.
import { prisma } from '../db';
import { inicioDoDia } from '../services/metas.service';

export const JANELA_DIAS_BASELINE = 14;
export const AMOSTRA_MINIMA_BASELINE = 5;

export type MetricaBaseline = 'PA' | 'TICKET_MEDIO' | 'FATURAMENTO_DIA';

export interface BaselineResultado {
  metrica: MetricaBaseline;
  valor: number | null;
  amostras: number;
  amostraSuficiente: boolean;
}

/**
 * Recalcula as 3 baselines pessoais do vendedor usando os fechamentos diários
 * anteriores a `diaReferencia` (exclusive — nunca inclui o próprio dia avaliado,
 * evitando circularidade). Idempotente: pode ser chamado várias vezes, sempre
 * recalcula do zero a partir dos dados reais.
 */
export async function recomputarBaselines(vendedorId: string, diaReferencia: Date): Promise<BaselineResultado[]> {
  const fimJanela = inicioDoDia(diaReferencia);
  const inicioJanela = new Date(fimJanela);
  inicioJanela.setDate(inicioJanela.getDate() - JANELA_DIAS_BASELINE);

  const snapshots = await prisma.indicadorRealizado.findMany({
    where: { vendedorId, dataHora: { gte: inicioJanela, lt: fimJanela } },
    orderBy: { dataHora: 'asc' },
  });

  const fechamentoPorDia = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    fechamentoPorDia.set(inicioDoDia(s.dataHora).toISOString(), s);
  }

  const dias = [...fechamentoPorDia.values()];
  const amostras = dias.length;
  const amostraSuficiente = amostras >= AMOSTRA_MINIMA_BASELINE;

  const mediaFaturamento = amostras > 0 ? dias.reduce((acc, d) => acc + Number(d.faturamento), 0) / amostras : null;
  const mediaPa = amostras > 0 ? dias.reduce((acc, d) => acc + Number(d.pa), 0) / amostras : null;
  const mediaTicket = amostras > 0 ? dias.reduce((acc, d) => acc + Number(d.ticketMedio), 0) / amostras : null;

  const resultados: BaselineResultado[] = [
    { metrica: 'FATURAMENTO_DIA', valor: mediaFaturamento, amostras, amostraSuficiente },
    { metrica: 'PA', valor: mediaPa, amostras, amostraSuficiente },
    { metrica: 'TICKET_MEDIO', valor: mediaTicket, amostras, amostraSuficiente },
  ];

  for (const r of resultados) {
    if (r.valor === null) continue;
    await prisma.baselinePessoal.upsert({
      where: { vendedorId_metrica: { vendedorId, metrica: r.metrica } },
      create: {
        vendedorId,
        metrica: r.metrica,
        valor: r.valor,
        amostras: r.amostras,
        amostraMinima: AMOSTRA_MINIMA_BASELINE,
      },
      update: { valor: r.valor, amostras: r.amostras, amostraMinima: AMOSTRA_MINIMA_BASELINE },
    });
  }

  return resultados;
}

/** Delta percentual de `valorAtual` em relação à baseline, ou null se a baseline não tem amostra suficiente. */
export function deltaPercentual(valorAtual: number, baseline: BaselineResultado): number | null {
  if (!baseline.amostraSuficiente || baseline.valor === null || baseline.valor === 0) return null;
  return ((valorAtual - baseline.valor) / baseline.valor) * 100;
}
