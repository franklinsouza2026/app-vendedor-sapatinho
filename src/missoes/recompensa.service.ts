// Recompensa de missão/desafio (Fatia 7, seção 18-20). Reaproveita o evento
// `MISSAO` já reservado no enum TipoEventoGamificacao desde o schema
// original — nunca usado até agora. A régua ativa (REGUA_V1) não define
// XP/moeda pra `MISSAO`, então o bônus é ZERO por padrão: "mission bonus só
// existe quando configurado" (seção 20) — nunca inventamos um valor aqui, a
// mesma disciplina de concederRecompensaTreinamento (src/gamificacao/
// treinamento.service.ts). Concluir a missão em si (mudar o status) NUNCA
// depende do bônus existir.
import { prisma } from '../db';
import { getRegraAtiva } from '../gamificacao/regras.service';
import { concederXp, concederMoeda } from '../gamificacao/ledger.service';
import { createLogger } from '../utils/logger';

const log = createLogger('missoes:recompensa');

export interface ConcessaoBonusInput {
  empresaId: string;
  lojaId: string;
  vendedorId: string;
  referenciaTipo: 'MISSAO' | 'DESAFIO';
  referenciaId: string;
  idempotencyKey: string;
}

/**
 * Concede o bônus de MISSAO se a régua ativa tiver um valor configurado pra
 * ele (hoje, nenhuma régua tem — bônus é 0 por padrão, nunca inventado).
 * Idempotente via idempotencyKey; nunca lança erro se não houver bônus.
 */
export async function concederBonusMissao(input: ConcessaoBonusInput) {
  const regra = await getRegraAtiva(input.empresaId);
  const xp = regra.regrasXp.MISSAO ?? 0;
  const moeda = regra.regrasMoeda.MISSAO ?? 0;

  if (xp === 0 && moeda === 0) {
    log.debug({ vendedorId: input.vendedorId, referenciaTipo: input.referenciaTipo }, 'nenhum bônus de missão configurado na régua ativa — nada concedido');
    return null;
  }

  const ctx = {
    empresaId: input.empresaId,
    lojaId: input.lojaId,
    vendedorId: input.vendedorId,
    tipoEvento: 'MISSAO' as const,
    referenciaTipo: input.referenciaTipo,
    referenciaId: input.referenciaId,
    idempotencyKey: input.idempotencyKey,
    regraVersao: regra.versao,
    ocorridoEm: new Date(),
  };

  if (xp > 0) await concederXp(ctx, xp);
  if (moeda > 0) await concederMoeda(ctx, moeda);
  return { xp, moeda };
}

/** Verifica se o bônus de uma missão/desafio (por idempotencyKey) já foi concedido, sem tentar conceder de novo. */
export async function bonusMissaoJaConcedido(idempotencyKey: string): Promise<boolean> {
  const xp = await prisma.xpTransacao.findUnique({ where: { idempotencyKey } });
  if (xp) return true;
  const moeda = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey } });
  return !!moeda;
}
