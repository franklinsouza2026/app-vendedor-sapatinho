// Sinais positivos (Fatia 9, seção 17-18) — sistema só SUGERE destaque, quem
// decide reconhecer é sempre o gerente (nunca cria um Recognition sozinho).
// Reaproveita o Feed já existente (Fatia 8) como fonte dos eventos "fortes"
// (meta batida, badge, certificação, missão, PDI) — zero motor paralelo.
// PA/TICKET/STREAK são o espelho positivo do que o Attention Engine já
// calcula pro lado negativo (mesma BaselinePessoal/StreakVendedor).
import { prisma } from '../db';
import { inicioDoDia, realizadoNoPeriodoEmLote } from '../services/metas.service';
import { deltaPercentual, type BaselineResultado } from '../gamificacao/baseline.service';

export interface SinalPositivo {
  tipo: 'GOAL_REACHED' | 'PERSONAL_IMPROVEMENT' | 'PA_IMPROVEMENT' | 'TICKET_IMPROVEMENT' | 'MISSION_COMPLETED' | 'CERTIFICATION_EARNED' | 'COMPETENCY_EVOLUTION' | 'STREAK' | 'BADGE_EARNED';
  sellerId: string;
  descricao: string;
  metadata: Record<string, unknown>;
}

const LIMIAR_MELHORIA_PERCENTUAL = 15;
const LIMIAR_STREAK_DESTAQUE = 3;

export async function listarSinaisPositivosDaLoja(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<SinalPositivo[]> {
  const vendedores = await prisma.vendedor.findMany({ where: { empresaId, lojaId, papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true, nome: true } });
  const ids = vendedores.map((v) => v.id);
  if (ids.length === 0) return [];

  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));
  const hoje = inicioDoDia(agora);
  const sinais: SinalPositivo[] = [];

  const [eventosFeedHoje, baselines, realizadoHoje, streaks] = await Promise.all([
    prisma.feedEvent.findMany({
      where: { lojaId, subjectId: { in: ids }, createdAt: { gte: hoje }, eventType: { in: ['GOAL_REACHED', 'BADGE_EARNED', 'CERTIFICATION_ISSUED', 'MISSION_COMPLETED', 'PDI_COMPLETED', 'TRACK_COMPLETED'] } },
    }),
    prisma.baselinePessoal.findMany({ where: { vendedorId: { in: ids }, metrica: { in: ['PA', 'TICKET_MEDIO'] } } }),
    realizadoNoPeriodoEmLote(ids, hoje, agora),
    prisma.streakVendedor.findMany({ where: { vendedorId: { in: ids }, streakAtual: { gte: LIMIAR_STREAK_DESTAQUE } } }),
  ]);

  for (const evento of eventosFeedHoje) {
    if (!evento.subjectId) continue;
    const mapaTipo: Record<string, SinalPositivo['tipo']> = {
      GOAL_REACHED: 'GOAL_REACHED',
      BADGE_EARNED: 'BADGE_EARNED',
      CERTIFICATION_ISSUED: 'CERTIFICATION_EARNED',
      MISSION_COMPLETED: 'MISSION_COMPLETED',
      PDI_COMPLETED: 'COMPETENCY_EVOLUTION',
      TRACK_COMPLETED: 'COMPETENCY_EVOLUTION',
    };
    sinais.push({
      tipo: mapaTipo[evento.eventType] ?? 'GOAL_REACHED',
      sellerId: evento.subjectId,
      descricao: `${nomePorId.get(evento.subjectId) ?? '—'} ${evento.eventType === 'GOAL_REACHED' ? 'bateu a meta do dia' : 'teve uma conquista'} hoje`,
      metadata: { eventType: evento.eventType, templateData: evento.templateData },
    });
  }

  const baselinePorChave = new Map(baselines.map((b) => [`${b.vendedorId}:${b.metrica}`, b]));
  for (const vendedorId of ids) {
    const hojeReal = realizadoHoje.get(vendedorId);
    if (!hojeReal || hojeReal.numAtendimentos === 0) continue;

    for (const [tipo, metrica, valorAtual] of [
      ['PA_IMPROVEMENT', 'PA', hojeReal.pa],
      ['TICKET_IMPROVEMENT', 'TICKET_MEDIO', hojeReal.ticketMedio],
    ] as const) {
      const row = baselinePorChave.get(`${vendedorId}:${metrica}`);
      if (!row || row.amostras < 5) continue;
      const baselineResultado: BaselineResultado = { metrica, valor: Number(row.valor), amostras: row.amostras, amostraSuficiente: true };
      const delta = deltaPercentual(valorAtual, baselineResultado);
      if (delta !== null && delta >= LIMIAR_MELHORIA_PERCENTUAL) {
        sinais.push({
          tipo,
          sellerId: vendedorId,
          descricao: `${nomePorId.get(vendedorId) ?? '—'} está ${Math.round(delta)}% acima da própria média em ${metrica === 'PA' ? 'PA' : 'ticket médio'} hoje`,
          metadata: { deltaPercentual: Math.round(delta) },
        });
      }
    }
  }

  for (const s of streaks) {
    sinais.push({
      tipo: 'STREAK',
      sellerId: s.vendedorId,
      descricao: `${nomePorId.get(s.vendedorId) ?? '—'} está há ${s.streakAtual} dias seguidos batendo a meta diária`,
      metadata: { streakAtual: s.streakAtual },
    });
  }

  return sinais;
}
