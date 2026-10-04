// Avaliador de missão governada — progresso SEMPRE calculado dos fatos de
// venda (Venda/VendaItem, devoluções descontadas, canceladas excluídas). O
// cliente nunca informa progresso nem "concluí".
import { CriterioMissao, Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { diaLocal } from '../../tempo/dia';
import { efetivoDaVenda } from '../vendas/agregado.service';
import { calcularSequencia, serieDoVendedor } from '../reconciliacao/motor';

type VendaComItens = Prisma.VendaGetPayload<{ include: { itens: true } }>;

export interface ParametrosAvaliacao {
  criterio: CriterioMissao;
  produtos: string[];
  parametros: Record<string, unknown>;
  inicio: Date;
  fim: Date;
  tz: string;
}

const normalizar = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('pt-BR');

function itensEfetivos(v: VendaComItens) {
  if (v.status === 'CANCELADA') return [];
  return v.itens
    .map((i) => ({ referencia: i.referencia, categoria: i.categoria, quantidade: i.quantidade - i.quantidadeDevolvida, pares: i.pares - i.paresDevolvidos, valor: Number(i.valor) - Number(i.valorDevolvido) }))
    .filter((i) => i.quantidade > 0);
}

/** Progresso puro a partir das vendas já carregadas (testável sem banco). */
export function progressoDasVendas(vendas: VendaComItens[], p: Omit<ParametrosAvaliacao, 'inicio' | 'fim'>): number {
  const produtos = new Set(p.produtos);
  const categoria = normalizar(p.parametros.categoria as string | undefined);
  switch (p.criterio) {
    case 'VENDAS_PERIODO':
      return vendas.reduce((a, v) => a + efetivoDaVenda(v).vendas, 0);
    case 'FATURAMENTO_PERIODO':
      return Math.round(vendas.reduce((a, v) => a + efetivoDaVenda(v).faturamento, 0) * 100) / 100;
    case 'PARES_PRODUTOS':
      return vendas.reduce((a, v) => a + itensEfetivos(v).filter((i) => produtos.has(i.referencia)).reduce((x, i) => x + i.pares, 0), 0);
    case 'VENDAS_PRODUTOS':
      return vendas.filter((v) => itensEfetivos(v).some((i) => produtos.has(i.referencia))).length;
    case 'VENDAS_MULTIPAR': {
      const minimo = Number(p.parametros.minimoPares ?? 2);
      return vendas.filter((v) => itensEfetivos(v).reduce((a, i) => a + i.pares, 0) >= minimo).length;
    }
    case 'VENDAS_CATEGORIA':
      return vendas.filter((v) => itensEfetivos(v).some((i) => normalizar(i.categoria) === categoria)).length;
    case 'PARES_CATEGORIA':
      return vendas.reduce((a, v) => a + itensEfetivos(v).filter((i) => normalizar(i.categoria) === categoria).reduce((x, i) => x + i.pares, 0), 0);
    case 'DIAS_TICKET_ACIMA': {
      const minimo = Number(p.parametros.ticketMinimo ?? Infinity);
      const porDia = new Map<string, { fat: number; vendas: number }>();
      for (const v of vendas) {
        const e = efetivoDaVenda(v);
        if (!e.vendas) continue;
        const dia = diaLocal(v.ocorridoEm, p.tz);
        const atual = porDia.get(dia) ?? { fat: 0, vendas: 0 };
        porDia.set(dia, { fat: atual.fat + e.faturamento, vendas: atual.vendas + e.vendas });
      }
      return [...porDia.values()].filter((d) => d.fat / d.vendas > minimo).length;
    }
    default:
      return 0;
  }
}

export async function calcularProgresso(vendedorId: string, p: ParametrosAvaliacao, agora: Date = new Date()): Promise<number> {
  const ate = p.fim < agora ? p.fim : agora;
  if (ate < p.inicio) return 0;
  if (p.criterio === 'DIAS_META_SEGUIDOS') {
    const desde = diaLocal(p.inicio, p.tz);
    const hoje = diaLocal(ate, p.tz);
    const serie = await serieDoVendedor(vendedorId, desde, hoje, p.tz);
    return calcularSequencia(serie, diaLocal(agora, p.tz)).maior;
  }
  const vendas = await prisma.venda.findMany({ where: { vendedorId, ocorridoEm: { gte: p.inicio, lte: ate } }, include: { itens: true } });
  return progressoDasVendas(vendas, p);
}
