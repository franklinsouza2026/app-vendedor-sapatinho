// TrainerContextBuilder (seção 12 da Fatia 5). Resolve tudo a partir do
// vendedorId (sempre do JWT, nunca de parâmetro externo). Reaproveita
// getProgressoVendedor/recomputarBaselines/getMemoria já usados pelo Coach —
// não recalcula nada, só monta uma visão diferente e mais enxuta desses
// mesmos fatos determinísticos.
import { ModoTreinador } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, getProgressoVendedor } from '../services/metas.service';
import { recomputarBaselines } from '../gamificacao/baseline.service';
import { getMemoria } from '../coach/memory.service';
import { getSecoesRelevantes } from './playbook.service';
import { TrainerContext } from './context.types';

export interface EntradaTrainerContext {
  mode: ModoTreinador;
  objection?: string | null;
  situation?: string | null;
}

export interface ResultadoTrainerContext {
  context: TrainerContext;
  // id do Playbook (não só a versão) usado nesta geração — persistido em
  // TrainerMessage.playbookVersionId pra auditoria (seção 9 da Fatia 5): uma
  // publicação futura nunca reescreve retroativamente qual playbook foi
  // usado numa resposta já gerada.
  playbookId: string | null;
}

export async function buildTrainerContext(vendedorId: string, entrada: EntradaTrainerContext, agora: Date = new Date()): Promise<ResultadoTrainerContext> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({
    where: { id: vendedorId },
    include: { loja: true },
  });

  const [progresso, baselines, memoria, ultimoIndicador, playbookInfo] = await Promise.all([
    getProgressoVendedor(vendedorId, agora),
    recomputarBaselines(vendedorId, inicioDoDia(agora)),
    getMemoria(vendedorId, agora),
    prisma.indicadorRealizado.findFirst({ where: { vendedorId }, orderBy: { dataHora: 'desc' } }),
    getSecoesRelevantes(vendedor.empresaId, entrada.mode),
  ]);

  const dia = progresso.find((p) => p.periodo === 'DIA')!;
  const baselinePa = baselines.find((b) => b.metrica === 'PA')!;
  const baselineTicket = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;
  const goalPercent = dia.metaFaturamento && dia.metaFaturamento > 0 ? (dia.realizado.faturamento / dia.metaFaturamento) * 100 : null;

  return {
    playbookId: playbookInfo.id,
    context: {
      seller: { displayName: vendedor.nome },
      store: { name: vendedor.loja.nome },
      performance: { ticket: dia.realizado.ticketMedio, pa: dia.realizado.pa, goalPercent },
      baseline: {
        ticket: baselineTicket.amostraSuficiente ? baselineTicket.valor : null,
        pa: baselinePa.amostraSuficiente ? baselinePa.valor : null,
      },
      development: {
        strengths: memoria.strengths,
        developmentAreas: memoria.developmentAreas,
        currentFocus: memoria.currentFocus,
        recentTrainings: [], // Academia de Vendas é Fatia 6 — sem estrutura determinística pra isso ainda
      },
      playbook: { version: playbookInfo.version, relevantSections: playbookInfo.sections },
      request: { mode: entrada.mode, objection: entrada.objection ?? null, situation: entrada.situation ?? null },
      freshness: { lastDataSyncAt: ultimoIndicador ? ultimoIndicador.dataHora.toISOString() : null },
    },
  };
}
