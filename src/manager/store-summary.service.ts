// Store Summary (Fatia 9, seção 6-8) — agregador determinístico da loja
// inteira. ZERO cálculo novo de KPI: soma o que `Meta`/`IndicadorRealizado`
// já têm, reaproveitando exatamente as mesmas fontes/funções do painel do
// vendedor (metas.service.ts). Sempre batch (nunca 1 query por vendedor,
// seção 96) — a loja pode ter dezenas de vendedores.
import { Papel, StatusConta } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodoEmLote, metaDoPeriodoEmLote } from '../services/metas.service';

export interface StoreSummary {
  lojaId: string;
  referencia: Date;
  metaFaturamento: number | null;
  realizado: number;
  percentualAtingido: number | null;
  faltaParaMeta: number | null;
  pa: number;
  ticketMedio: number;
  vendedoresAtivosHoje: number;
  totalVendedores: number;
  /** Timestamp do snapshot mais recente já sincronizado do ERP hoje —
   * reaproveita `IndicadorRealizado.createdAt` como proxy de "última
   * sincronização" (não existe uma tabela de status de sync dedicada, e não
   * é este o momento de criar uma só pra isso). */
  freshness: Date | null;
}

export async function calcularStoreSummary(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<StoreSummary> {
  const vendedores = await prisma.vendedor.findMany({
    where: { empresaId, lojaId, papel: Papel.VENDEDOR, status: StatusConta.ACTIVE },
    select: { id: true },
  });
  const vendedorIds = vendedores.map((v) => v.id);
  const hoje = inicioDoDia(agora);

  const [realizadoPorVendedor, metaPorVendedor, freshnessRow] = await Promise.all([
    realizadoNoPeriodoEmLote(vendedorIds, hoje, agora),
    metaDoPeriodoEmLote(vendedorIds, 'FATURAMENTO', 'DIA', hoje),
    vendedorIds.length > 0
      ? prisma.indicadorRealizado.findFirst({
          where: { vendedorId: { in: vendedorIds }, dataHora: { gte: hoje } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  let faturamento = 0;
  let numAtendimentos = 0;
  let somaPaPonderada = 0;
  let metaFaturamento = 0;
  let temMeta = false;
  let vendedoresAtivosHoje = 0;

  for (const vendedorId of vendedorIds) {
    const r = realizadoPorVendedor.get(vendedorId);
    if (r) {
      if (r.numAtendimentos > 0) vendedoresAtivosHoje++;
      faturamento += r.faturamento;
      numAtendimentos += r.numAtendimentos;
      somaPaPonderada += r.pa * r.numAtendimentos;
    }
    const m = metaPorVendedor.get(vendedorId);
    if (m !== undefined) {
      metaFaturamento += m;
      temMeta = true;
    }
  }

  return {
    lojaId,
    referencia: hoje,
    metaFaturamento: temMeta ? metaFaturamento : null,
    realizado: faturamento,
    percentualAtingido: temMeta && metaFaturamento > 0 ? (faturamento / metaFaturamento) * 100 : null,
    faltaParaMeta: temMeta ? Math.max(0, metaFaturamento - faturamento) : null,
    pa: numAtendimentos > 0 ? somaPaPonderada / numAtendimentos : 0,
    ticketMedio: numAtendimentos > 0 ? faturamento / numAtendimentos : 0,
    vendedoresAtivosHoje,
    totalVendedores: vendedorIds.length,
    freshness: freshnessRow?.createdAt ?? null,
  };
}
