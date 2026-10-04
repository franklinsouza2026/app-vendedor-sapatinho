// Fechamento mensal do ranking — grava a posição FINAL de cada vendedor no
// ranking de vendas da loja (e geral) do mês encerrado. É o histórico que
// alimenta o recorde "Melhor posição" e a auditoria de resultado. Idempotente:
// se o mês já foi fechado, não recalcula (fato encerrado não muda).
import { prisma } from '../../db';
import { instanteDoDia, primeiroDiaDoMes, ultimoDiaDoMes, mesAnterior, mesLocal, paraDate } from '../../tempo/dia';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { getRegraAtiva, REGUA_V1 } from '../../gamificacao/regras.service';
import { estatisticasDoMes } from './estatisticas.service';
import { montarLinhas } from './ranking.service';

export async function fecharRankingDoMes(empresaId: string, mes: string) {
  const tz = await timezoneDaEmpresa(empresaId);
  const referencia = instanteDoDia(primeiroDiaDoMes(mes), tz);
  const ultimo = ultimoDiaDoMes(mes);
  const ja = await prisma.rankingSnapshot.count({ where: { empresaId, periodo: 'MES', referencia, tipo: 'FATURAMENTO', dia: paraDate(ultimo) } });
  if (ja > 0) return false;

  const regra = await getRegraAtiva(empresaId).catch(() => ({ pesosScore: REGUA_V1.pesosScore, versao: 1 }));
  // Quem foi elegível no mês: vendedores com venda no mês (inclui quem saiu depois — histórico).
  const comVenda = await prisma.venda.findMany({ where: { empresaId, dia: { gte: paraDate(primeiroDiaDoMes(mes)), lte: paraDate(ultimo) } }, select: { vendedorId: true }, distinct: ['vendedorId'] });
  const vendedores = await prisma.vendedor.findMany({ where: { empresaId, id: { in: comVenda.map((v) => v.vendedorId) }, papel: 'VENDEDOR' }, select: { id: true, lojaId: true } });
  if (!vendedores.length) return false;
  const stats = await estatisticasDoMes({ empresaId, vendedorIds: vendedores.map((v) => v.id), mes, ateDia: ultimo, hoje: ultimo, tz, pesos: regra.pesosScore });

  const linhas: { escopo: 'LOJA' | 'REDE'; lojaId: string | null; ids: string[] }[] = [{ escopo: 'REDE', lojaId: null, ids: vendedores.map((v) => v.id) }];
  for (const lojaId of new Set(vendedores.map((v) => v.lojaId))) linhas.push({ escopo: 'LOJA', lojaId, ids: vendedores.filter((v) => v.lojaId === lojaId).map((v) => v.id) });

  await prisma.$transaction(
    linhas.flatMap((l) =>
      montarLinhas(l.ids, stats, null, 'VENDAS', null).map((r) =>
        prisma.rankingSnapshot.create({ data: { empresaId, escopo: l.escopo, lojaId: l.lojaId, tipo: 'FATURAMENTO', periodo: 'MES', referencia, vendedorId: r.pessoaId, posicao: r.posicao, valor: r.valor ?? 0, regraVersao: 'versao' in regra ? regra.versao : 1, dia: paraDate(ultimo) } })
      )
    )
  );
  return true;
}

/** Fecha o mês anterior de todas as empresas (chamado pelo job diário; idempotente). */
export async function fecharMesAnteriorDeTodas(agora = new Date()) {
  const empresas = await prisma.empresa.findMany({ select: { id: true, timezone: true } });
  for (const e of empresas) await fecharRankingDoMes(e.id, mesAnterior(mesLocal(agora, e.timezone)));
}
