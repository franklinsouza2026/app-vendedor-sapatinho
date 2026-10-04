// Motor de eventos de performance → gamificação (seção 8 e 16 da fonte de
// verdade).
//
// Fase 1 (convergência, D4): este módulo virou uma FACHADA do motor único de
// reconciliação (src/fase1/reconciliacao/motor.ts). Antes havia aqui uma
// segunda implementação dos tiers de meta, que revertia só VendaCoins e nunca
// XP. Agora há UMA regra: o estado devido é recalculado dos fatos e o ledger é
// ajustado (concede ou estorna XP e VendaCoins), idempotente e sob trava por
// vendedor.
//
// Princípio: "motor calcula; IA interpreta" — nada aqui depende de LLM.
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../db';
import { diaLocal } from '../tempo/dia';
import { timezoneDaEmpresa } from '../tempo/empresa';
import { reconciliarVendedor, LIMIAR_MELHORA_PCT as LIMIAR } from '../fase1/reconciliacao/motor';

// Exportado — reaproveitado por src/missoes/ pra exibir o "objetivo" das
// missões PA_IMPROVEMENT/TICKET_IMPROVEMENT sem duplicar o número.
export const LIMIAR_MELHORA_PCT = LIMIAR;

export interface ResultadoAvaliacao {
  vendedorId: string;
  eventosNovos: TipoEventoGamificacao[];
  eventosRevertidos: TipoEventoGamificacao[];
}

/** Reconcilia o dia (local) de `agora` do vendedor. */
export async function avaliarMetaDiaria(vendedorId: string, agora: Date = new Date()): Promise<ResultadoAvaliacao> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId }, select: { empresaId: true } });
  const tz = await timezoneDaEmpresa(vendedor.empresaId);
  const resumo = await reconciliarVendedor(vendedorId, [diaLocal(agora, tz)], { agora });
  return { vendedorId, eventosNovos: resumo.concedidos, eventosRevertidos: resumo.revertidos };
}
