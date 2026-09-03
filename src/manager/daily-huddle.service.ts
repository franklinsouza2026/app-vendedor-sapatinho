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

// Pergunta aberta pra equipe, sempre não-judicativa — nunca "por que vocês
// não bateram a meta", sempre convite à reflexão/colaboração (seção 37).
const PERGUNTA_POR_TIPO: Record<string, string> = {
  NO_SALES_RECENTLY: 'O que tem dificultado o atendimento pra quem está há mais tempo sem fechar uma venda?',
  LOW_GOAL_ATTAINMENT: 'O que a gente pode ajustar hoje pra recuperar o ritmo do mês?',
  CONSISTENCY_DROP: 'O que estava funcionando bem antes que talvez a gente tenha deixado de fazer?',
  PA_BELOW_BASELINE: 'Que produto complementar faz sentido oferecer mais hoje?',
  TICKET_BELOW_BASELINE: 'Como podemos mostrar mais valor antes de falar de preço?',
  MISSION_STALLED: 'Alguém está travado em alguma missão? Como posso ajudar?',
  TRAINING_OVERDUE: 'Que horário do dia funciona melhor pra encaixar o treinamento pendente?',
  CERTIFICATION_EXPIRING: 'Vamos organizar a recertificação de quem está prestes a vencer?',
  PDI_STALLED: 'O que está impedindo o avanço no plano de desenvolvimento de alguém?',
  COMPETENCY_GAP: 'Que tipo de prática ajudaria a fechar esse gap de competência?',
  NO_RECENT_MANAGER_FOLLOWUP: 'Quem sente que precisa de uma conversa 1:1 esta semana?',
};

const ACAO_POR_TIPO: Record<string, string> = {
  NO_SALES_RECENTLY: 'Conversar hoje com quem está sem venda recente.',
  LOW_GOAL_ATTAINMENT: 'Reforçar o acompanhamento de meta com o time hoje.',
  CONSISTENCY_DROP: 'Reconhecer publicamente quem manteve consistência.',
  PA_BELOW_BASELINE: 'Praticar oferta de produto complementar em 1 atendimento hoje.',
  TICKET_BELOW_BASELINE: 'Praticar demonstração de valor em 1 atendimento hoje.',
  MISSION_STALLED: 'Perguntar individualmente quem está com missão parada.',
  TRAINING_OVERDUE: 'Agendar um horário pro treinamento pendente ainda hoje.',
  CERTIFICATION_EXPIRING: 'Avisar quem está com certificação prestes a vencer.',
  PDI_STALLED: 'Marcar uma revisão rápida de PDI com quem está parado.',
  COMPETENCY_GAP: 'Sugerir uma prática específica pra essa competência.',
  NO_RECENT_MANAGER_FOLLOWUP: 'Agendar um 1:1 ainda esta semana.',
};

/** Roteiro determinístico (seção 37) — sempre existe com IA OFF; o resumo de
 * IA opcional (`ai-advisor.service.ts`) só entra por cima disso, nunca no lugar. */
export interface RoteiroReuniao {
  foco: string;
  contexto: string;
  mensagemPrincipal: string;
  perguntaParaEquipe: string;
  acaoDoDia: string;
  fechamentoPositivo: string;
}

function montarRoteiro(storeSummary: StoreSummary, topAlertaTipo: string | null, temHighlight: boolean): RoteiroReuniao {
  const contexto =
    storeSummary.metaFaturamento !== null
      ? `Hoje a loja está em ${Math.round(storeSummary.percentualAtingido ?? 0)}% da meta do mês, com ${storeSummary.vendedoresAtivosHoje} de ${storeSummary.totalVendedores} vendedores já atendendo.`
      : `Ainda não há meta do mês cadastrada pra loja — ${storeSummary.vendedoresAtivosHoje} de ${storeSummary.totalVendedores} vendedores já atendendo hoje.`;

  return {
    foco: topAlertaTipo ? (FOCO_POR_TIPO[topAlertaTipo] ?? 'Sem foco específico identificado hoje.') : 'Nenhuma situação prioritária identificada hoje — bom momento pra reforçar o que está funcionando.',
    contexto,
    mensagemPrincipal: topAlertaTipo ? (FOCO_POR_TIPO[topAlertaTipo] ?? '') : 'O time está com a operação em dia — vamos manter o ritmo.',
    perguntaParaEquipe: topAlertaTipo ? (PERGUNTA_POR_TIPO[topAlertaTipo] ?? 'O que podemos melhorar juntos hoje?') : 'O que está funcionando bem hoje que vale a pena repetir amanhã?',
    acaoDoDia: topAlertaTipo ? (ACAO_POR_TIPO[topAlertaTipo] ?? 'Acompanhar de perto o time hoje.') : 'Reconhecer o bom trabalho do time hoje.',
    fechamentoPositivo: temHighlight ? 'Já temos destaques reais pra comemorar hoje — bora seguir esse ritmo!' : 'Vamos com tudo hoje — cada atendimento é uma nova chance de gerar um destaque!',
  };
}

export interface DailyHuddleData {
  storeSummary: StoreSummary;
  faturamentoOntem: number;
  highlights: SinalPositivo[];
  alertasPrioritarios: Awaited<ReturnType<typeof listarAlertas>>;
  temporadaAtual: Awaited<ReturnType<typeof listarSeasons>>[number] | null;
  competicoesAtivas: { id: string; name: string }[];
  treinamentosDaSemana: number;
  focoSugerido: string | null;
  roteiro: RoteiroReuniao;
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
    roteiro: montarRoteiro(storeSummary, topAlerta?.tipo ?? null, highlights.length > 0),
  };
}
