// Visão de Equipe do gerente (Fatia 9, seção 9) — lista agregada por
// vendedor. Disciplina anti-N+1 (seção 96): TODA leitura aqui é 1 query
// para a loja inteira (`groupBy`/`findMany({in:[...]})`), nunca 1 query por
// vendedor num loop — a matriz de competência COMPLETA (cara, evidência por
// evidência) só é calculada no detalhe de UM vendedor por vez, nunca aqui.
import { Papel, StatusConta } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodoEmLote, metaDoPeriodoEmLote } from '../services/metas.service';

export interface LinhaEquipe {
  vendedorId: string;
  nome: string;
  percentualMetaDia: number | null;
  pa: number;
  ticketMedio: number;
  missoesAtivas: number;
  pdiAtivo: boolean;
  certificacoesExpirando: number;
  alertasAbertos: number;
  alertaMaisSeveroTipo: string | null;
  alertaMaisSeveroSeveridade: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

const ORDEM_SEVERIDADE: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listarVisaoEquipe(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<LinhaEquipe[]> {
  const vendedores = await prisma.vendedor.findMany({
    where: { empresaId, lojaId, papel: Papel.VENDEDOR, status: StatusConta.ACTIVE },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
  const vendedorIds = vendedores.map((v) => v.id);
  if (vendedorIds.length === 0) return [];

  const hoje = inicioDoDia(agora);
  const em15Dias = new Date(agora.getTime() + 15 * 24 * 60 * 60 * 1000);

  const [realizadoPorVendedor, metaPorVendedor, missoesAgrupadas, pdisAtivos, certificacoesExpirandoAgrupadas, alertasAbertos] = await Promise.all([
    realizadoNoPeriodoEmLote(vendedorIds, hoje, agora),
    metaDoPeriodoEmLote(vendedorIds, 'FATURAMENTO', 'DIA', hoje),
    prisma.missionAssignment.groupBy({
      by: ['vendedorId'],
      where: { vendedorId: { in: vendedorIds }, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
      _count: { _all: true },
    }),
    prisma.developmentPlan.findMany({ where: { subjectUserId: { in: vendedorIds }, status: 'ACTIVE' }, select: { subjectUserId: true } }),
    prisma.userCertification.groupBy({
      by: ['userId'],
      where: { userId: { in: vendedorIds }, status: { in: ['EXPIRING'] }, expiresAt: { lte: em15Dias } },
      _count: { _all: true },
    }),
    prisma.managerAlert.findMany({
      where: { empresaId, lojaId, sellerId: { in: vendedorIds }, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      select: { sellerId: true, tipo: true, severidade: true },
    }),
  ]);

  const missoesPorVendedor = new Map(missoesAgrupadas.map((m) => [m.vendedorId, m._count._all]));
  const pdiAtivoPorVendedor = new Set(pdisAtivos.map((p) => p.subjectUserId));
  const certExpirandoPorVendedor = new Map(certificacoesExpirandoAgrupadas.map((c) => [c.userId, c._count._all]));

  const alertasPorVendedor = new Map<string, { tipo: string; severidade: 'LOW' | 'MEDIUM' | 'HIGH' }[]>();
  for (const a of alertasAbertos) {
    if (!a.sellerId) continue;
    const lista = alertasPorVendedor.get(a.sellerId) ?? [];
    lista.push({ tipo: a.tipo, severidade: a.severidade });
    alertasPorVendedor.set(a.sellerId, lista);
  }

  return vendedores.map((v) => {
    const realizado = realizadoPorVendedor.get(v.id);
    const meta = metaPorVendedor.get(v.id);
    const alertas = alertasPorVendedor.get(v.id) ?? [];
    const maisSevero = alertas.length > 0 ? [...alertas].sort((a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade])[0] : null;

    return {
      vendedorId: v.id,
      nome: v.nome,
      percentualMetaDia: meta !== undefined && meta > 0 ? ((realizado?.faturamento ?? 0) / meta) * 100 : null,
      pa: realizado?.pa ?? 0,
      ticketMedio: realizado?.ticketMedio ?? 0,
      missoesAtivas: missoesPorVendedor.get(v.id) ?? 0,
      pdiAtivo: pdiAtivoPorVendedor.has(v.id),
      certificacoesExpirando: certExpirandoPorVendedor.get(v.id) ?? 0,
      alertasAbertos: alertas.length,
      alertaMaisSeveroTipo: maisSevero?.tipo ?? null,
      alertaMaisSeveroSeveridade: maisSevero?.severidade ?? null,
    };
  });
}
