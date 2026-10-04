/**
 * Configuração da recompensa pelo primeiro acesso do dia — por empresa,
 * persistida e auditada. Sem registro = DESLIGADA (nada é concedido sem uma
 * decisão do Admin). Os valores nunca vêm do cliente no momento do check-in:
 * o check-in lê esta configuração no servidor.
 */
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';

export interface ConfigRecompensa {
  ativo: boolean;
  xp: number;
  moedas: number;
}

export const CONFIG_PADRAO: ConfigRecompensa = { ativo: false, xp: 0, moedas: 0 };

/** Teto de sanidade por acesso — evita erro de digitação virar inflação de moeda. */
export const MAXIMO_POR_ACESSO = 1000;

export async function obterConfigRecompensa(empresaId: string): Promise<ConfigRecompensa> {
  const c = await prisma.configRecompensaAcesso.findUnique({ where: { empresaId } });
  return c ? { ativo: c.ativo, xp: c.xp, moedas: c.moedas } : { ...CONFIG_PADRAO };
}

export async function salvarConfigRecompensa(empresaId: string, atorId: string, nova: ConfigRecompensa): Promise<ConfigRecompensa> {
  const antes = await obterConfigRecompensa(empresaId);
  const salvo = await prisma.configRecompensaAcesso.upsert({
    where: { empresaId },
    update: { ativo: nova.ativo, xp: nova.xp, moedas: nova.moedas, atualizadoPor: atorId },
    create: { empresaId, ativo: nova.ativo, xp: nova.xp, moedas: nova.moedas, atualizadoPor: atorId },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'ENGAGEMENT_REWARD_CONFIG_UPDATED', actorId: atorId, metadata: { antes, depois: nova } });
  return { ativo: salvo.ativo, xp: salvo.xp, moedas: salvo.moedas };
}
