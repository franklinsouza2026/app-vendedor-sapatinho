// Motor de eventos de performance → gamificação (seção 8 e 16 da fonte de
// verdade). Roda a cada sync do ERP (intraday) para a meta diária, e é
// responsável por conceder E reverter (compensação quando o ERP corrige um
// faturamento pra baixo — cancelamento/devolução refletido no resync).
//
// Princípio: "motor calcula; IA interpreta" — nada aqui depende de LLM.
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../db';
import { dataISO, inicioDoDia, metaDoPeriodo, realizadoNoPeriodo } from '../services/metas.service';
import { getRegraAtiva } from './regras.service';
import { concederMoeda, concederXp, reverterMoeda } from './ledger.service';
import { concederBadge } from './badges.service';
import { deltaPercentual, recomputarBaselines } from './baseline.service';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:motor');

const TIERS_META: { limiar: number; evento: TipoEventoGamificacao }[] = [
  { limiar: 100, evento: 'META_DIARIA_100' },
  { limiar: 110, evento: 'META_DIARIA_110' },
  { limiar: 120, evento: 'META_DIARIA_120' },
  { limiar: 150, evento: 'META_DIARIA_150' },
];

// v1 (decisão explícita, documentada em 05-Decisoes-e-Tradeoffs.md): "melhora
// validada" de PA/ticket = pelo menos +5% acima da baseline pessoal. Reversão
// de melhora PA/ticket não é implementada nesta versão (limitação conhecida:
// só o tier de meta, que envolve valor financeiro maior, é revertido em resync).
const LIMIAR_MELHORA_PCT = 5;

export interface ResultadoAvaliacao {
  vendedorId: string;
  eventosNovos: TipoEventoGamificacao[];
  eventosRevertidos: TipoEventoGamificacao[];
}

/**
 * Avalia a meta diária do vendedor "agora" (intraday). Idempotente e capaz de
 * reverter tiers que deixaram de ser válidos após um resync do ERP.
 */
export async function avaliarMetaDiaria(vendedorId: string, agora: Date = new Date()): Promise<ResultadoAvaliacao> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const regra = await getRegraAtiva(vendedor.empresaId);
  const dia = inicioDoDia(agora);
  const ds = dataISO(agora);

  const eventosNovos: TipoEventoGamificacao[] = [];
  const eventosRevertidos: TipoEventoGamificacao[] = [];

  const [meta, realizado] = await Promise.all([
    metaDoPeriodo(vendedorId, 'FATURAMENTO', 'DIA', dia),
    realizadoNoPeriodo(vendedorId, dia, agora),
  ]);

  if (meta === null || meta <= 0) {
    log.debug({ vendedorId }, 'sem meta diária cadastrada — nada a avaliar');
  } else {
    const percentualMeta = (realizado.faturamento / meta) * 100;

    for (const tier of TIERS_META) {
      const referenciaTipo = 'META_DIARIA_TIER';
      const referenciaId = `${vendedorId}:${ds}:${tier.limiar}`;
      const qualifica = percentualMeta >= tier.limiar;

      // Rastreia por saldo líquido (crédito + reversões), não por "existe 1 linha":
      // depois de um ciclo concede→reverte no mesmo dia (resync do ERP oscilando),
      // uma nova concessão precisa de uma idempotencyKey nova (a antiga já foi usada).
      const transacoes = await prisma.moedaTransacao.findMany({
        where: { referenciaTipo, referenciaId },
        orderBy: { createdAt: 'asc' },
      });
      const saldoLiquido = transacoes.reduce((acc, t) => acc + t.valor, 0);
      const ativo = saldoLiquido > 0;

      if (qualifica && !ativo) {
        const geracao = transacoes.length;
        const idemKey = `meta-diaria-${tier.limiar}-${vendedorId}-${ds}-g${geracao}`;
        const moeda = regra.regrasMoeda[tier.evento] ?? 0;
        const ctx = {
          empresaId: vendedor.empresaId,
          lojaId: vendedor.lojaId,
          vendedorId,
          tipoEvento: tier.evento,
          referenciaTipo,
          referenciaId,
          idempotencyKey: idemKey,
          regraVersao: regra.versao,
          ocorridoEm: agora,
        };
        // XP só na 1ª geração: XP nunca é revertido quando a moeda é revertida
        // (princípio "XP não diminui em situações normais"), então conceder XP
        // de novo a cada oscilação concede→reverte→reconcede do ERP no mesmo
        // dia inflaria XP sem limite. A moeda, sim, é reconcedida a cada geração.
        if (geracao === 0) {
          const xp = regra.regrasXp[tier.evento] ?? 0;
          if (xp > 0) await concederXp(ctx, xp);
        }
        if (moeda > 0) await concederMoeda(ctx, moeda);
        eventosNovos.push(tier.evento);

        if (tier.limiar === 100) {
          await concederBadge(vendedor.empresaId, vendedor.lojaId, vendedorId, 'PRIMEIRA_META', `badge-primeira-meta-${vendedorId}`);
        }
      } else if (!qualifica && ativo) {
        const ultimaTransacaoAtiva = transacoes[transacoes.length - 1];
        await reverterMoeda(ultimaTransacaoAtiva.idempotencyKey, 'resync do ERP reduziu o faturamento do dia abaixo do tier');
        eventosRevertidos.push(tier.evento);
      }
    }
  }

  // Melhora de PA/ticket vs. baseline pessoal (baseline calculada com dados
  // ANTERIORES a hoje — nunca circular, ver baseline.service.ts).
  const baselines = await recomputarBaselines(vendedorId, dia);
  const baselinePa = baselines.find((x) => x.metrica === 'PA')!;
  const baselineTicket = baselines.find((x) => x.metrica === 'TICKET_MEDIO')!;

  const deltaPa = deltaPercentual(realizado.pa, baselinePa);
  if (deltaPa !== null && deltaPa >= LIMIAR_MELHORA_PCT) {
    const idemKey = `melhora-pa-${vendedorId}-${ds}`;
    const jaConcedido = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey: idemKey } });
    if (!jaConcedido) {
      const ctx = {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId,
        tipoEvento: 'MELHORA_PA' as const,
        referenciaTipo: 'BASELINE_PA',
        idempotencyKey: idemKey,
        regraVersao: regra.versao,
        ocorridoEm: agora,
      };
      const xp = regra.regrasXp.MELHORA_PA ?? 0;
      const moeda = regra.regrasMoeda.MELHORA_PA ?? 0;
      if (xp > 0) await concederXp(ctx, xp);
      if (moeda > 0) await concederMoeda(ctx, moeda);
      eventosNovos.push('MELHORA_PA');
      await concederBadge(vendedor.empresaId, vendedor.lojaId, vendedorId, 'PA_MASTER', `badge-pa-master-${vendedorId}`);
    }
  }

  const deltaTicket = deltaPercentual(realizado.ticketMedio, baselineTicket);
  if (deltaTicket !== null && deltaTicket >= LIMIAR_MELHORA_PCT) {
    const idemKey = `melhora-ticket-${vendedorId}-${ds}`;
    const jaConcedido = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey: idemKey } });
    if (!jaConcedido) {
      const ctx = {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId,
        tipoEvento: 'MELHORA_TICKET' as const,
        referenciaTipo: 'BASELINE_TICKET',
        idempotencyKey: idemKey,
        regraVersao: regra.versao,
        ocorridoEm: agora,
      };
      const xp = regra.regrasXp.MELHORA_TICKET ?? 0;
      const moeda = regra.regrasMoeda.MELHORA_TICKET ?? 0;
      if (xp > 0) await concederXp(ctx, xp);
      if (moeda > 0) await concederMoeda(ctx, moeda);
      eventosNovos.push('MELHORA_TICKET');
      await concederBadge(vendedor.empresaId, vendedor.lojaId, vendedorId, 'TICKET_MASTER', `badge-ticket-master-${vendedorId}`);
    }
  }

  return { vendedorId, eventosNovos, eventosRevertidos };
}
