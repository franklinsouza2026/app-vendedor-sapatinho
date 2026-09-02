// ManagerAttentionEngine (Fatia 9, seção 10-11) — 100% determinístico, ZERO
// IA. Detecta SITUAÇÕES observáveis, nunca rotula a pessoa ("vendedor
// parado"/"ruim" são proibidos — só fatos: "sem venda há N dias"). Todo
// threshold vem de `ManagerAlertConfig`/`THRESHOLDS_PADRAO`, nunca um valor
// inventado ad-hoc. Disciplina anti-N+1: cada checagem abaixo é 1 (ou poucas)
// queries pra LOJA INTEIRA, nunca 1 por vendedor — só `COMPETENCY_GAP` é
// avaliado fora daqui, sob demanda, no detalhe de UM vendedor por vez
// (reaproveita `calcularMatrizCompetencias`, cara demais pra rodar em lote
// a cada carregamento da Home/Equipe).
import { Papel, StatusConta, TipoAlertaGerencial } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, inicioDoMes, realizadoNoPeriodoEmLote, metaDoPeriodoEmLote } from '../services/metas.service';
import { diasTranscorridos } from '../gamificacao/ranking.service';
import { deltaPercentual, JANELA_DIAS_BASELINE, type BaselineResultado, type MetricaBaseline } from '../gamificacao/baseline.service';
import { getConfigsDaEmpresa } from './alert-config.service';
import { calcularMatrizCompetencias } from '../universidade/score-engine.service';

export type Severidade = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SinalDetectado {
  tipo: TipoAlertaGerencial;
  severidade: Severidade;
  sellerId: string | null;
  sourceType: string;
  sourceId: string | null;
  detectedAt: Date;
  metadata: Record<string, unknown>;
}

function ultimoDiaDoMes(referencia: Date): number {
  return new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0).getDate();
}

/**
 * Passe "leve" — roda a cada carregamento de Home/Equipe do gerente.
 * Cobre todos os tipos de alerta MENOS `COMPETENCY_GAP` (ver
 * `avaliarCompetencyGapDoVendedor`, avaliado sob demanda por vendedor).
 */
export async function detectarSinaisDaLoja(empresaId: string, lojaId: string, agora: Date = new Date()): Promise<SinalDetectado[]> {
  const vendedores = await prisma.vendedor.findMany({
    where: { empresaId, lojaId, papel: Papel.VENDEDOR, status: StatusConta.ACTIVE },
    select: { id: true, createdAt: true },
  });
  const ids = vendedores.map((v) => v.id);
  if (ids.length === 0) return [];

  const configs = await getConfigsDaEmpresa(empresaId);
  const sinais: SinalDetectado[] = [];
  const hoje = inicioDoDia(agora);

  // ---------- NO_SALES_RECENTLY ----------
  if (configs.NO_SALES_RECENTLY.ativo) {
    const limiar = configs.NO_SALES_RECENTLY.parametros.diasSemVenda ?? 2;
    const janela30 = new Date(hoje);
    janela30.setDate(janela30.getDate() - 30);
    const ultimasVendas = await prisma.indicadorRealizado.groupBy({
      by: ['vendedorId'],
      where: { vendedorId: { in: ids }, dataHora: { gte: janela30 }, numAtendimentos: { gt: 0 } },
      _max: { dataHora: true },
    });
    const ultimaVendaPorVendedor = new Map(ultimasVendas.map((u) => [u.vendedorId, u._max.dataHora]));

    for (const v of vendedores) {
      if (v.createdAt > janela30) continue; // vendedor novo demais pra ter 30 dias de histórico — nunca alerta "sem venda" sem base
      const ultima = ultimaVendaPorVendedor.get(v.id);
      const diasSemVenda = ultima ? Math.floor((hoje.getTime() - inicioDoDia(ultima).getTime()) / 86400000) : 30;
      if (diasSemVenda >= limiar) {
        sinais.push({
          tipo: 'NO_SALES_RECENTLY',
          severidade: diasSemVenda >= limiar * 2 ? 'HIGH' : 'MEDIUM',
          sellerId: v.id,
          sourceType: 'INDICADOR_REALIZADO',
          sourceId: null,
          detectedAt: agora,
          metadata: { diasSemVenda, limiar },
        });
      }
    }
  }

  // ---------- LOW_GOAL_ATTAINMENT (pacing por dias do mês — nunca intraday, seção 76) ----------
  if (configs.LOW_GOAL_ATTAINMENT.ativo) {
    const limiar = configs.LOW_GOAL_ATTAINMENT.parametros.limiarPercentualDoEsperado ?? 70;
    const inicioMes = inicioDoMes(agora);
    const diasNoMes = ultimoDiaDoMes(agora);
    const transcorridos = Math.min(diasNoMes, diasTranscorridos(inicioMes, agora));
    const pctPeriodoTranscorrido = (transcorridos / diasNoMes) * 100;

    const [realizadoPorVendedor, metaPorVendedor] = await Promise.all([
      realizadoNoPeriodoEmLote(ids, inicioMes, agora),
      metaDoPeriodoEmLote(ids, 'FATURAMENTO', 'MES', inicioMes),
    ]);

    for (const v of vendedores) {
      const meta = metaPorVendedor.get(v.id);
      if (meta === undefined || meta <= 0) continue; // sem meta oficial cadastrada — nunca inventa uma
      const realizado = realizadoPorVendedor.get(v.id)?.faturamento ?? 0;
      const pctAtingido = (realizado / meta) * 100;
      const razaoDoEsperado = pctPeriodoTranscorrido > 0 ? (pctAtingido / pctPeriodoTranscorrido) * 100 : 100;
      if (razaoDoEsperado < limiar) {
        sinais.push({
          tipo: 'LOW_GOAL_ATTAINMENT',
          severidade: razaoDoEsperado < limiar / 2 ? 'HIGH' : 'MEDIUM',
          sellerId: v.id,
          sourceType: 'META_MES',
          sourceId: null,
          detectedAt: agora,
          metadata: { pctAtingido: Math.round(pctAtingido), pctEsperadoPeloPacing: Math.round(pctPeriodoTranscorrido), razaoDoEsperado: Math.round(razaoDoEsperado) },
        });
      }
    }
  }

  // ---------- PA_BELOW_BASELINE / TICKET_BELOW_BASELINE ----------
  const precisaBaseline = configs.PA_BELOW_BASELINE.ativo || configs.TICKET_BELOW_BASELINE.ativo;
  if (precisaBaseline) {
    const [baselines, realizadoHoje] = await Promise.all([
      prisma.baselinePessoal.findMany({ where: { vendedorId: { in: ids }, metrica: { in: ['PA', 'TICKET_MEDIO'] } } }),
      realizadoNoPeriodoEmLote(ids, hoje, agora),
    ]);
    const baselinePorChave = new Map(baselines.map((b) => [`${b.vendedorId}:${b.metrica}`, b]));

    for (const v of vendedores) {
      const hojeReal = realizadoHoje.get(v.id);
      if (!hojeReal || hojeReal.numAtendimentos === 0) continue; // sem atendimento hoje ainda — não é "abaixo da baseline", é falta de dado do dia

      for (const [tipoAlerta, metrica, valorAtual, config] of [
        ['PA_BELOW_BASELINE', 'PA', hojeReal.pa, configs.PA_BELOW_BASELINE],
        ['TICKET_BELOW_BASELINE', 'TICKET_MEDIO', hojeReal.ticketMedio, configs.TICKET_BELOW_BASELINE],
      ] as [TipoAlertaGerencial, MetricaBaseline, number, { ativo: boolean; parametros: Record<string, number> }][]) {
        if (!config.ativo) continue;
        const row = baselinePorChave.get(`${v.id}:${metrica}`);
        if (!row || row.amostras < 5) continue; // amostra insuficiente — nunca fabrica alerta (mesma régua de AMOSTRA_MINIMA_BASELINE)
        const baselineResultado: BaselineResultado = { metrica, valor: Number(row.valor), amostras: row.amostras, amostraSuficiente: true };
        const delta = deltaPercentual(valorAtual, baselineResultado);
        const limiar = config.parametros.limiarQuedaPercentual ?? 15;
        if (delta !== null && delta <= -limiar) {
          sinais.push({
            tipo: tipoAlerta,
            severidade: delta <= -limiar * 2 ? 'HIGH' : 'MEDIUM',
            sellerId: v.id,
            sourceType: 'BASELINE_PESSOAL',
            sourceId: row.id,
            detectedAt: agora,
            metadata: { valorAtual: Math.round(valorAtual * 100) / 100, baseline: Math.round(Number(row.valor) * 100) / 100, deltaPercentual: Math.round(delta) },
          });
        }
      }
    }
  }

  // ---------- CONSISTENCY_DROP ----------
  if (configs.CONSISTENCY_DROP.ativo) {
    const limiarPontos = configs.CONSISTENCY_DROP.parametros.limiarQuedaPercentual ?? 20;
    const inicioJanela28 = new Date(hoje);
    inicioJanela28.setDate(inicioJanela28.getDate() - 2 * JANELA_DIAS_BASELINE);
    const meio = new Date(hoje);
    meio.setDate(meio.getDate() - JANELA_DIAS_BASELINE);

    const checagens = await prisma.streakChecagem.findMany({
      where: { vendedorId: { in: ids }, tipo: 'META_DIARIA', data: { gte: inicioJanela28, lt: hoje } },
      select: { vendedorId: true, data: true, atingiu: true },
    });

    const porVendedor = new Map<string, { anterior: { total: number; bateu: number }; atual: { total: number; bateu: number } }>();
    for (const c of checagens) {
      const bucket = porVendedor.get(c.vendedorId) ?? { anterior: { total: 0, bateu: 0 }, atual: { total: 0, bateu: 0 } };
      const alvo = c.data < meio ? bucket.anterior : bucket.atual;
      alvo.total++;
      if (c.atingiu) alvo.bateu++;
      porVendedor.set(c.vendedorId, bucket);
    }

    for (const [vendedorId, dados] of porVendedor.entries()) {
      if (dados.anterior.total < 3 || dados.atual.total < 3) continue; // amostra mínima pra comparar
      const pctAnterior = (dados.anterior.bateu / dados.anterior.total) * 100;
      const pctAtual = (dados.atual.bateu / dados.atual.total) * 100;
      const quedaPontos = pctAnterior - pctAtual;
      if (quedaPontos >= limiarPontos) {
        sinais.push({
          tipo: 'CONSISTENCY_DROP',
          severidade: quedaPontos >= limiarPontos * 2 ? 'HIGH' : 'MEDIUM',
          sellerId: vendedorId,
          sourceType: 'STREAK_CHECAGEM',
          sourceId: null,
          detectedAt: agora,
          metadata: { pctAnterior: Math.round(pctAnterior), pctAtual: Math.round(pctAtual), quedaPontos: Math.round(quedaPontos) },
        });
      }
    }
  }

  // ---------- MISSION_STALLED ----------
  if (configs.MISSION_STALLED.ativo) {
    const limiar = configs.MISSION_STALLED.parametros.diasParado ?? 3;
    const limiteData = new Date(hoje);
    limiteData.setDate(limiteData.getDate() - limiar);
    const missoesParadas = await prisma.missionAssignment.findMany({
      where: { vendedorId: { in: ids }, status: 'ASSIGNED', assignedAt: { lte: limiteData } },
      select: { id: true, vendedorId: true, assignedAt: true },
    });
    for (const m of missoesParadas) {
      const diasParado = Math.floor((hoje.getTime() - inicioDoDia(m.assignedAt).getTime()) / 86400000);
      sinais.push({
        tipo: 'MISSION_STALLED',
        severidade: diasParado >= limiar * 2 ? 'HIGH' : 'MEDIUM',
        sellerId: m.vendedorId,
        sourceType: 'MISSION_ASSIGNMENT',
        sourceId: m.id,
        detectedAt: agora,
        metadata: { diasParado },
      });
    }
  }

  // ---------- TRAINING_OVERDUE (reaproveita item de PDI, seção 77) ----------
  if (configs.TRAINING_OVERDUE.ativo) {
    const limiar = configs.TRAINING_OVERDUE.parametros.diasAtraso ?? 3;
    const limiteData = new Date(hoje);
    limiteData.setDate(limiteData.getDate() - limiar);
    const itensAtrasados = await prisma.developmentPlanItem.findMany({
      where: {
        status: 'PENDING',
        tipo: { in: ['LESSON', 'TRACK', 'QUIZ', 'SIMULATION'] },
        plano: { subjectUserId: { in: ids }, status: 'ACTIVE', targetDate: { lte: limiteData } },
      },
      select: { id: true, tipo: true, plano: { select: { subjectUserId: true, targetDate: true } } },
    });
    for (const item of itensAtrasados) {
      const diasAtraso = item.plano.targetDate ? Math.floor((hoje.getTime() - inicioDoDia(item.plano.targetDate).getTime()) / 86400000) : limiar;
      sinais.push({
        tipo: 'TRAINING_OVERDUE',
        severidade: diasAtraso >= limiar * 2 ? 'HIGH' : 'MEDIUM',
        sellerId: item.plano.subjectUserId,
        sourceType: 'DEVELOPMENT_PLAN_ITEM',
        sourceId: item.id,
        detectedAt: agora,
        metadata: { diasAtraso, tipoConteudo: item.tipo },
      });
    }
  }

  // ---------- CERTIFICATION_EXPIRING ----------
  if (configs.CERTIFICATION_EXPIRING.ativo) {
    const limiar = configs.CERTIFICATION_EXPIRING.parametros.diasParaExpirar ?? 15;
    const limiteData = new Date(hoje);
    limiteData.setDate(limiteData.getDate() + limiar);
    const expirando = await prisma.userCertification.findMany({
      where: { userId: { in: ids }, status: { in: ['VALID', 'EXPIRING'] }, expiresAt: { not: null, gte: agora, lte: limiteData } },
      select: { id: true, userId: true, expiresAt: true, definitionId: true },
    });
    for (const c of expirando) {
      const diasParaExpirar = Math.floor(((c.expiresAt as Date).getTime() - hoje.getTime()) / 86400000);
      sinais.push({
        tipo: 'CERTIFICATION_EXPIRING',
        severidade: diasParaExpirar <= limiar / 3 ? 'HIGH' : 'MEDIUM',
        sellerId: c.userId,
        sourceType: 'USER_CERTIFICATION',
        sourceId: c.id,
        detectedAt: agora,
        metadata: { diasParaExpirar, definitionId: c.definitionId },
      });
    }
  }

  // ---------- PDI_STALLED ----------
  if (configs.PDI_STALLED.ativo) {
    const limiar = configs.PDI_STALLED.parametros.diasSemEvolucao ?? 14;
    const limiteData = new Date(hoje);
    limiteData.setDate(limiteData.getDate() - limiar);
    const planosAtivos = await prisma.developmentPlan.findMany({
      where: { subjectUserId: { in: ids }, status: 'ACTIVE', startedAt: { lte: limiteData } },
      select: { id: true, subjectUserId: true, itens: { select: { completedAt: true } } },
    });
    for (const plano of planosAtivos) {
      const ultimaEvolucao = plano.itens.reduce<Date | null>((max, item) => {
        if (!item.completedAt) return max;
        return !max || item.completedAt > max ? item.completedAt : max;
      }, null);
      if (ultimaEvolucao && ultimaEvolucao > limiteData) continue; // evoluiu dentro da janela — não está parado
      sinais.push({
        tipo: 'PDI_STALLED',
        severidade: !ultimaEvolucao ? 'HIGH' : 'MEDIUM',
        sellerId: plano.subjectUserId,
        sourceType: 'DEVELOPMENT_PLAN',
        sourceId: plano.id,
        detectedAt: agora,
        metadata: { ultimaEvolucaoEm: ultimaEvolucao?.toISOString() ?? null },
      });
    }
  }

  // ---------- NO_RECENT_MANAGER_FOLLOWUP ----------
  if (configs.NO_RECENT_MANAGER_FOLLOWUP.ativo) {
    const limiar = configs.NO_RECENT_MANAGER_FOLLOWUP.parametros.diasSemFollowup ?? 21;
    const limiteData = new Date(hoje);
    limiteData.setDate(limiteData.getDate() - limiar);
    const ultimos1a1 = await prisma.oneOnOne.groupBy({
      by: ['sellerId'],
      where: { empresaId, lojaId, sellerId: { in: ids }, status: 'COMPLETED' },
      _max: { completedAt: true },
    });
    const ultimoPorVendedor = new Map(ultimos1a1.map((u) => [u.sellerId, u._max.completedAt]));

    for (const v of vendedores) {
      if (v.createdAt > limiteData) continue; // vendedor novo demais — ainda não é "esquecido"
      const ultimo = ultimoPorVendedor.get(v.id);
      if (ultimo && ultimo > limiteData) continue;
      const diasSemFollowup = ultimo ? Math.floor((hoje.getTime() - inicioDoDia(ultimo).getTime()) / 86400000) : Math.floor((hoje.getTime() - inicioDoDia(v.createdAt).getTime()) / 86400000);
      sinais.push({
        tipo: 'NO_RECENT_MANAGER_FOLLOWUP',
        severidade: diasSemFollowup >= limiar * 2 ? 'HIGH' : 'MEDIUM',
        sellerId: v.id,
        sourceType: 'ONE_ON_ONE',
        sourceId: null,
        detectedAt: agora,
        metadata: { diasSemFollowup },
      });
    }
  }

  return sinais;
}

/**
 * COMPETENCY_GAP — avaliado sob demanda, 1 vendedor por vez (nunca em lote
 * pra loja inteira: `calcularMatrizCompetencias` já é a operação mais cara
 * do produto, ver comentário em score-engine.service.ts). NOT_ENOUGH_DATA
 * NUNCA vira alerta de baixa competência (seção 77) — só `status === 'OK'`
 * com `priority === 'HIGH'` gera sinal.
 */
export async function avaliarCompetencyGapDoVendedor(empresaId: string, subjectUserId: string, agora: Date = new Date()): Promise<SinalDetectado[]> {
  const configs = await getConfigsDaEmpresa(empresaId);
  if (!configs.COMPETENCY_GAP.ativo) return [];

  const matriz = await calcularMatrizCompetencias(subjectUserId, 'VENDEDOR', agora);
  return matriz
    .filter((g) => g.status === 'OK' && g.priority === 'HIGH')
    .map((g) => ({
      tipo: 'COMPETENCY_GAP' as TipoAlertaGerencial,
      severidade: 'MEDIUM' as Severidade,
      sellerId: subjectUserId,
      sourceType: 'COMPETENCY',
      sourceId: g.competencyId,
      detectedAt: agora,
      metadata: { score: g.score, target: g.target, gap: g.gap },
    }));
}
