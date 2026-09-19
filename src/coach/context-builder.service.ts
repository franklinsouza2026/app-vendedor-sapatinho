// CoachContextBuilder — resolve tudo a partir do vendedorId (sempre do JWT,
// nunca de parâmetro externo) e produz um CoachContext limpo. Testável sem LLM.
//
// ETAPA 2B.1: passou a receber a DECISÃO DE PERTINÊNCIA e a carregar **somente
// os domínios autorizados**. Isso é deliberadamente mais forte que filtrar na
// renderização: um bloco não autorizado nunca é buscado no banco, então não há
// caminho secundário por onde ele possa vazar para o prompt — nem pelo
// formatter, nem pelo metadata enviado ao provider, nem por um campo esquecido.
import { CriterioMissao, MoodCheckIn } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, getProgressoVendedor } from '../services/metas.service';
import { getTotalXp } from '../gamificacao/ledger.service';
import { calcularNivel } from '../gamificacao/niveis';
import { recomputarBaselines } from '../gamificacao/baseline.service';
import { DecisaoPertinencia } from '../pertinencia/tipos';
import { CoachContext, ContextoComercial, ContextoDesenvolvimento } from './context.types';
import { getMemoria, getGapsDeCompetencia } from './memory.service';
import { getMissaoPrioritariaParaCoach } from '../missoes/service';
import { getCheckinHoje } from './checkin.service';
import { listarAtividadesRecentes } from './atividades.service';
import { listarSinaisPositivosDoVendedor } from './celebracao.service';
import { selecionarIntervencaoDoTurno } from './selecao-intervencao.service';
import { listarContinuidadeRelevante } from './intervencao.service';
import { reconciliarConclusoes } from './conclusao.service';

/** Vendas necessárias pra bater a meta, dado o ticket médio atual — cálculo determinístico, nunca do LLM. */
function estimarVendasRestantes(amountRemaining: number | null, ticket: number): number | null {
  if (amountRemaining === null || amountRemaining <= 0 || ticket <= 0) return amountRemaining === 0 ? 0 : null;
  return Math.ceil(amountRemaining / ticket);
}

/**
 * Missões se dividem pelo CRITÉRIO, não pela ação: "Supere seu PA de
 * referência" tem ação de Treinador mas é medida por KPI — mencioná-la numa
 * conversa de acolhimento seria falar de performance pela porta dos fundos.
 *
 * `Record` sobre o enum inteiro, não lista de inclusão: assim um critério novo
 * **não compila** até alguém decidir o domínio dele. Com uma lista, o critério
 * esquecido cairia silenciosamente em "comercial" — que é o pior default
 * possível, porque é justamente o bloco que a fatia existe pra conter.
 */
const DOMINIO_DA_MISSAO: Record<CriterioMissao, 'APRENDIZAGEM' | 'COMERCIAL' | 'GESTAO'> = {
  DAILY_GOAL: 'COMERCIAL',
  PA_IMPROVEMENT: 'COMERCIAL',
  TICKET_IMPROVEMENT: 'COMERCIAL',
  STREAK_3: 'COMERCIAL',
  COMPLETE_LESSON: 'APRENDIZAGEM',
  PASS_QUIZ: 'APRENDIZAGEM',
  COMPLETE_SIMULATION: 'APRENDIZAGEM',
  // Missões de gerente (Fatia 9.6). `/coach` não restringe papel, então um
  // gerente conversando também tem missão do dia — e "Realize um 1:1" não é
  // indicador comercial, é prática de gestão. Vai com desenvolvimento.
  RECOGNITION_CREATED: 'GESTAO',
  ONE_ON_ONE_COMPLETED: 'GESTAO',
  PDI_REVIEWED: 'GESTAO',
};

/** Só missão medida por KPI pertence ao bloco comercial. */
function ehMissaoComercial(criterio: CriterioMissao): boolean {
  return DOMINIO_DA_MISSAO[criterio] === 'COMERCIAL';
}

export async function buildCoachContext(
  vendedorId: string,
  pertinencia: DecisaoPertinencia,
  agora: Date = new Date(),
  /** Check-in já lido pelo chamador — evita reler o mesmo registro na mesma requisição. */
  checkinJaLido?: MoodCheckIn | null,
  /** Esta mensagem foi a resposta a uma sugestão? Então o turno não abre outra. */
  respondeuSugestao = false
): Promise<CoachContext> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({
    where: { id: vendedorId },
    include: { loja: true },
  });

  const querDesenvolvimento = pertinencia.dominios.includes('DESENVOLVIMENTO');
  const querComercial = pertinencia.dominios.includes('COMERCIAL');

  // A missão do dia é consultada uma vez e roteada pelo critério — nunca
  // duplicada em dois blocos.
  const precisaMissao = querDesenvolvimento || querComercial;

  // `getMemoria` já calcula a matriz de competências internamente. Quando os
  // dois blocos são autorizados, buscá-la de novo em `getGapsDeCompetencia`
  // seria calcular a mesma coisa duas vezes no caminho quente — então a
  // memória é resolvida UMA vez e os gaps saem dela.
  // Fecha, por FATO DE SISTEMA, as sugestões cuja atividade já foi feita —
  // antes de montar a continuidade. Sem isto o Conselheiro perguntaria "você
  // fez?" sobre algo que o próprio banco sabe que foi feito.
  await reconciliarConclusoes(vendedorId);

  const [checkin, continuidade, missaoPrioritaria, ultimoIndicador, memoria] = await Promise.all([
    checkinJaLido !== undefined ? Promise.resolve(checkinJaLido) : getCheckinHoje(vendedorId, agora).then((c) => c?.mood ?? null),
    listarContinuidadeRelevante(vendedorId, agora),
    precisaMissao ? getMissaoPrioritariaParaCoach(vendedorId, agora) : Promise.resolve(null),
    // Frescor acompanha qualquer dado do ERP — só faz sentido quando há bloco
    // comercial pra datar.
    querComercial ? prisma.indicadorRealizado.findFirst({ where: { vendedorId }, orderBy: { dataHora: 'desc' } }) : Promise.resolve(null),
    querComercial ? getMemoria(vendedorId, agora) : Promise.resolve(null),
  ]);

  const missaoEhComercial = missaoPrioritaria !== null && ehMissaoComercial(missaoPrioritaria.criterionType);
  const textoMissao = missaoPrioritaria ? `${missaoPrioritaria.title} (${missaoPrioritaria.progresso}%)` : null;

  const desenvolvimento: ContextoDesenvolvimento | null = querDesenvolvimento
    ? await (async () => {
        const [competencyGaps, recentTrainings, positiveSignals] = await Promise.all([
          memoria ? Promise.resolve(memoria.competencyGaps) : getGapsDeCompetencia(vendedorId, agora),
          listarAtividadesRecentes(vendedorId, agora),
          listarSinaisPositivosDoVendedor(vendedorId, agora),
        ]);

        // SELECIONA ANTES DE GERAR (Etapa 2B.3): dos candidatos acima, no
        // máximo UM vira intervenção estruturada do turno. Os demais não
        // entram no prompt — e, por não entrarem, continuam elegíveis.
        //
        // `gapsParaContexto` não é o mesmo que `competencyGaps`: sai dele o que
        // tem intervenção viva ou em silêncio. Mandar a lista crua ao prompt
        // reabriria pelo canal não rastreado exatamente o que a seleção acabou
        // de fechar — o modelo re-sugeriria a competência pendente, sem
        // registro nenhum, que é o bug original vestido de outra roupa.
        const { intervencao, gapsParaContexto } = await selecionarIntervencaoDoTurno(
          vendedorId,
          pertinencia.estado,
          { positiveSignals, competencyGaps },
          agora,
          respondeuSugestao
        );

        return {
          competencyGaps: gapsParaContexto,
          recentTrainings,
          intervencaoDoTurno: intervencao,
          currentMission: missaoEhComercial ? null : textoMissao,
        };
      })()
    : null;

  const comercial: ContextoComercial | null = querComercial
    ? await (async () => {
        const [progresso, xpTotal, baselines, streak, badgesRecentes] = await Promise.all([
          getProgressoVendedor(vendedorId, agora),
          getTotalXp(vendedorId),
          recomputarBaselines(vendedorId, inicioDoDia(agora)),
          prisma.streakVendedor.findUnique({ where: { vendedorId } }),
          prisma.badgeConcessao.findMany({ where: { vendedorId }, include: { badge: true }, orderBy: { concedidoEm: 'desc' }, take: 3 }),
        ]);

        const dia = progresso.find((p) => p.periodo === 'DIA')!;
        const baselinePa = baselines.find((b) => b.metrica === 'PA')!;
        const baselineTicket = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;
        const goalPercent = dia.metaFaturamento && dia.metaFaturamento > 0 ? (dia.realizado.faturamento / dia.metaFaturamento) * 100 : null;

        return {
          goal: {
            todayGoal: dia.metaFaturamento,
            realized: dia.realizado.faturamento,
            goalPercent,
            amountRemaining: dia.faltaParaMeta,
            estimatedSalesRemaining: estimarVendasRestantes(dia.faltaParaMeta, dia.realizado.ticketMedio),
          },
          performance: {
            ticket: dia.realizado.ticketMedio,
            pa: dia.realizado.pa,
            salesCount: dia.realizado.numAtendimentos,
          },
          baseline: {
            ticket: baselineTicket.amostraSuficiente ? baselineTicket.valor : null,
            pa: baselinePa.amostraSuficiente ? baselinePa.valor : null,
            status: baselinePa.amostraSuficiente && baselineTicket.amostraSuficiente ? ('disponivel' as const) : ('em_formacao' as const),
          },
          gamification: {
            xp: xpTotal,
            level: calcularNivel(xpTotal).nome,
            streak: streak?.streakAtual ?? 0,
            recentBadges: badgesRecentes.map((b) => b.badge.titulo),
          },
          professionalMemorySummary: memoria!.summary,
          currentFocus: memoria!.currentFocus,
          currentMission: missaoEhComercial ? textoMissao : null,
        };
      })()
    : null;

  return {
    seller: { displayName: vendedor.nome },
    store: { name: vendedor.loja.nome },
    pertinencia,
    humano: {
      checkinHoje: checkin,
      continuidade: continuidade.map((i) => ({
        assunto: (i.metadata as { titulo?: string } | null)?.titulo ?? 'um assunto que conversamos',
        estado: i.status,
        quando: i.ocorridoEm.toISOString(),
      })),
    },
    desenvolvimento,
    comercial,
    freshness: { lastDataSyncAt: ultimoIndicador ? ultimoIndicador.dataHora.toISOString() : null },
  };
}
