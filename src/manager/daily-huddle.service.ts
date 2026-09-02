// Reunião do Dia / Ritual Diário (Fatia 9, seção 31-35) — base 100%
// determinística (funciona inteiro com IA OFF, seção 33); o resumo textual
// via IA é só um EXTRA opcional (`ai-advisor.service.ts`), nunca a única
// fonte dos dados. Zero motor novo: tudo aqui é composição do que já existe
// (Store Summary, Alertas, Sinais Positivos, Season/Competition, PDI).
import { inicioDoDia, realizadoNoPeriodoEmLote } from '../services/metas.service';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { calcularStoreSummary, type StoreSummary } from './store-summary.service';
import { listarAlertas } from './alerts.service';
import { listarSinaisPositivosDaLoja, type SinalPositivo } from './positive-signals.service';
import { listarSeasons } from '../competicoes/seasons.service';

// Frases sempre FATUAIS, nunca causais (seção 43/44) — nenhum template aqui
// atribui causa ("caiu porque...", "está desmotivado").
const FOCO_POR_TIPO: Record<string, string> = {
  NO_SALES_RECENTLY: 'Priorize contato com quem está sem venda registrada recentemente.',
  LOW_GOAL_ATTAINMENT: 'O ritmo de meta do mês está abaixo do esperado para os dias já passados — vale reforçar o acompanhamento.',
  CONSISTENCY_DROP: 'A consistência em bater a meta diária caiu em relação ao período anterior.',
  PA_BELOW_BASELINE: 'O PA está abaixo da própria média de alguns vendedores hoje.',
  TICKET_BELOW_BASELINE: 'O ticket médio está abaixo da própria média de alguns vendedores hoje.',
  MISSION_STALLED: 'Há missões atribuídas sem progresso há alguns dias.',
  TRAINING_OVERDUE: 'Há treinamentos do plano de desenvolvimento com prazo vencido.',
  CERTIFICATION_EXPIRING: 'Há certificações prestes a vencer.',
  PDI_STALLED: 'Há planos de desenvolvimento sem evolução recente.',
  COMPETENCY_GAP: 'Há uma competência com gap identificado em relação ao alvo.',
  NO_RECENT_MANAGER_FOLLOWUP: 'Há vendedores sem um 1:1 recente.',
};

export interface DailyHuddleData {
  storeSummary: StoreSummary;
  faturamentoOntem: number;
  highlights: SinalPositivo[];
  alertasPrioritarios: Awaited<ReturnType<typeof listarAlertas>>;
  temporadaAtual: Awaited<ReturnType<typeof listarSeasons>>[number] | null;
  competicoesAtivas: { id: string; name: string }[];
  treinamentosDaSemana: number;
  focoSugerido: string | null;
}

export async function montarDailyHuddle(empresaId: string, lojaId: string, agora: Date = new Date(), managerId?: string): Promise<DailyHuddleData> {
  const hoje = inicioDoDia(agora);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const vendedores = await prisma.vendedor.findMany({ where: { empresaId, lojaId, papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true } });
  const ids = vendedores.map((v) => v.id);

  const em7Dias = new Date(hoje);
  em7Dias.setDate(em7Dias.getDate() + 7);

  const [storeSummary, realizadoOntem, highlights, alertasPrioritarios, seasons, competicoesAtivas, treinamentosDaSemana] = await Promise.all([
    calcularStoreSummary(empresaId, lojaId, agora),
    realizadoNoPeriodoEmLote(ids, ontem, hoje),
    listarSinaisPositivosDaLoja(empresaId, lojaId, agora),
    listarAlertas(empresaId, lojaId, { status: ['OPEN', 'ACKNOWLEDGED'] }),
    listarSeasons(),
    prisma.competition.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, take: 5 }),
    ids.length > 0
      ? prisma.developmentPlanItem.count({ where: { status: 'PENDING', plano: { subjectUserId: { in: ids }, status: 'ACTIVE', targetDate: { gte: hoje, lte: em7Dias } } } })
      : Promise.resolve(0),
  ]);

  const faturamentoOntem = [...realizadoOntem.values()].reduce((acc, r) => acc + r.faturamento, 0);
  const topAlerta = alertasPrioritarios[0] ?? null;

  if (managerId) {
    await registrarEventoAuditoria({ empresaId, acao: 'MANAGER_BRIEF_GENERATED', actorId: managerId, metadata: { lojaId } });
  }

  return {
    storeSummary,
    faturamentoOntem,
    highlights,
    alertasPrioritarios: alertasPrioritarios.slice(0, 10),
    temporadaAtual: seasons.find((s) => s.status === 'ACTIVE') ?? null,
    competicoesAtivas,
    treinamentosDaSemana,
    focoSugerido: topAlerta ? (FOCO_POR_TIPO[topAlerta.tipo] ?? null) : null,
  };
}
