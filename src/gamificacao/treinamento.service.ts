// Concessão de recompensa por treinamento (Fatia 6) — reaproveita a régua já
// versionada desde a Fatia 2 (TREINAMENTO_CONCLUIDO=+20XP/+5moedas,
// QUIZ_APROVADO=+20XP/+5moedas — ver REGUA_V1 em regras.service.ts). Nunca
// inventa valor novo; nunca é chamado pelo LLM ou pelo frontend — só pelo
// backend, depois de validar elegibilidade (Simulator: avaliação válida +
// mínimo de turnos; Academia: aula concluída / quiz aprovado).
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../db';
import { getRegraAtiva } from './regras.service';
import { concederXp, concederMoeda } from './ledger.service';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:treinamento');

export interface ConcessaoTreinamentoInput {
  empresaId: string;
  lojaId: string;
  vendedorId: string;
  tipoEvento: Extract<TipoEventoGamificacao, 'TREINAMENTO_CONCLUIDO' | 'QUIZ_APROVADO'>;
  referenciaTipo: string;
  referenciaId: string;
  idempotencyKey: string;
}

/**
 * Concede XP + moeda pra um evento de treinamento elegível. Idempotente
 * (mesma idempotencyKey nunca duplica — ver ledger.service.ts). Retorna
 * `null` sem lançar erro se a regra ativa não tiver valor para o evento
 * (nunca inventa número fora da régua versionada).
 */
export async function concederRecompensaTreinamento(input: ConcessaoTreinamentoInput) {
  const regra = await getRegraAtiva(input.empresaId);
  const xp = regra.regrasXp[input.tipoEvento] ?? 0;
  const moeda = regra.regrasMoeda[input.tipoEvento] ?? 0;

  const ctx = {
    empresaId: input.empresaId,
    lojaId: input.lojaId,
    vendedorId: input.vendedorId,
    tipoEvento: input.tipoEvento,
    referenciaTipo: input.referenciaTipo,
    referenciaId: input.referenciaId,
    idempotencyKey: input.idempotencyKey,
    regraVersao: regra.versao,
    ocorridoEm: new Date(),
  };

  if (xp === 0 && moeda === 0) {
    log.warn({ tipoEvento: input.tipoEvento }, 'régua ativa não define XP/moeda pra este evento — nada concedido');
    return null;
  }

  if (xp > 0) await concederXp(ctx, xp);
  if (moeda > 0) await concederMoeda(ctx, moeda);

  return { xp, moeda };
}

/** Verifica se um evento de treinamento (por idempotencyKey) já foi concedido — sem tentar conceder de novo. */
export async function recompensaTreinamentoJaConcedida(idempotencyKey: string): Promise<boolean> {
  const xp = await prisma.xpTransacao.findUnique({ where: { idempotencyKey } });
  if (xp) return true;
  const moeda = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey } });
  return !!moeda;
}
