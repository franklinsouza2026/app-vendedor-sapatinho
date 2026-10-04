// Agregado diário por vendedor (D1/D4) — DERIVADO das vendas individuais.
//
// `IndicadorRealizado` continua sendo a tabela que meta, ranking, score,
// baseline, competições e painéis já leem (nenhum consumidor precisou mudar
// de contrato), mas na Fase 1 ele deixa de ser um snapshot vindo pronto do
// ERP: é recalculado aqui a partir de `Venda`/`VendaItem`, descontando
// cancelamentos e devoluções. Recalcular é idempotente — sempre do zero.
//
// Uma linha por vendedor por dia local, gravada no ÚLTIMO instante do dia
// (`dataHora` = 23:59:59.999 local): é o "fechamento do dia" que
// `realizadoNoPeriodo` já escolhe (último snapshot do dia).
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { fimDoDiaLocal, paraDate } from '../../tempo/dia';

export const FONTE_AGREGADO = 'fase1-agregado-vendas';

export interface TotaisDia {
  faturamento: number;
  vendas: number;
  pecas: number;
  pares: number;
}

type VendaComItens = Prisma.VendaGetPayload<{ include: { itens: true } }>;

/** Valor, peças e pares EFETIVOS de uma venda (cancelada = 0; devolvido desconta). */
export function efetivoDaVenda(venda: VendaComItens): TotaisDia {
  if (venda.status === 'CANCELADA') return { faturamento: 0, vendas: 0, pecas: 0, pares: 0 };
  const devolvido = venda.itens.reduce((a, i) => a + Number(i.valorDevolvido), 0);
  const pecas = venda.itens.reduce((a, i) => a + (i.quantidade - i.quantidadeDevolvida), 0);
  const pares = venda.itens.reduce((a, i) => a + (i.pares - i.paresDevolvidos), 0);
  const faturamento = Math.max(0, Math.round((Number(venda.valor) - devolvido) * 100) / 100);
  // Venda inteiramente devolvida deixa de contar como venda.
  return { faturamento, vendas: faturamento > 0 || pecas > 0 ? 1 : 0, pecas: Math.max(0, pecas), pares: Math.max(0, pares) };
}

export function somarTotais(lista: TotaisDia[]): TotaisDia {
  return lista.reduce(
    (a, t) => ({ faturamento: Math.round((a.faturamento + t.faturamento) * 100) / 100, vendas: a.vendas + t.vendas, pecas: a.pecas + t.pecas, pares: a.pares + t.pares }),
    { faturamento: 0, vendas: 0, pecas: 0, pares: 0 }
  );
}

/** Recalcula e grava o agregado de (vendedor, dia local). */
export async function recalcularAgregadoDia(vendedorId: string, dia: string, tz: string): Promise<TotaisDia> {
  const vendas = await prisma.venda.findMany({ where: { vendedorId, dia: paraDate(dia) }, include: { itens: true }, orderBy: { ocorridoEm: 'asc' } });
  const totais = somarTotais(vendas.map(efetivoDaVenda));
  const ultima = vendas[vendas.length - 1];
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId }, select: { empresaId: true, lojaId: true } });
  const dataHora = fimDoDiaLocal(dia, tz);
  const ticketMedio = totais.vendas > 0 ? Math.round((totais.faturamento / totais.vendas) * 100) / 100 : 0;
  const pa = totais.vendas > 0 ? Math.round((totais.pecas / totais.vendas) * 100) / 100 : 0;

  const dados = {
    faturamento: totais.faturamento,
    ticketMedio,
    pa,
    numAtendimentos: totais.vendas,
    pecas: totais.pecas,
    pares: totais.pares,
    lojaId: ultima?.lojaId ?? vendedor.lojaId,
    fonteJobId: FONTE_AGREGADO,
  };
  await prisma.indicadorRealizado.upsert({
    where: { vendedorId_dataHora: { vendedorId, dataHora } },
    create: { empresaId: vendedor.empresaId, vendedorId, dataHora, ...dados },
    update: dados,
  });
  return totais;
}
