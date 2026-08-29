// Control Plane das regras de gamificação (Padrão 2). Só uma versão fica
// ativa por empresa. Os valores de v1 vêm de FONTE_DE_VERDADE_VENDEDOR_IA.md
// (seção 14 — VendaCoins, seção 13 — XP, seção 18 — pesos do Score Geral).
import { prisma } from '../db';
import { TipoEventoGamificacao } from '@prisma/client';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:regras');

export interface PesosScore {
  meta: number;
  evolucao: number;
  pa: number;
  ticket: number;
  consistencia: number;
}

export interface RegraAtiva {
  versao: number;
  regrasXp: Partial<Record<TipoEventoGamificacao, number>>;
  regrasMoeda: Partial<Record<TipoEventoGamificacao, number>>;
  pesosScore: PesosScore;
}

interface EntradaCache {
  regra: RegraAtiva;
  atualizadoEm: number;
}

// TTL por empresa (não um relógio global): a atividade de uma empresa nunca
// deve afetar por quanto tempo o cache de outra fica válido.
const cache = new Map<string, EntradaCache>();
const TTL_MS = 5 * 60 * 1000;

export async function getRegraAtiva(empresaId: string): Promise<RegraAtiva> {
  const entrada = cache.get(empresaId);
  const expirado = !entrada || Date.now() - entrada.atualizadoEm > TTL_MS;

  if (expirado) {
    const row = await prisma.regraGamificacaoVersao.findFirst({
      where: { empresaId, ativo: true },
      orderBy: { versao: 'desc' },
    });

    if (!row) {
      throw new Error(
        `Nenhuma RegraGamificacaoVersao ativa para empresa ${empresaId}. Rode o seed (scripts/seed.ts) antes de processar gamificação.`
      );
    }

    const regra: RegraAtiva = {
      versao: row.versao,
      regrasXp: row.regrasXp as Partial<Record<TipoEventoGamificacao, number>>,
      regrasMoeda: row.regrasMoeda as Partial<Record<TipoEventoGamificacao, number>>,
      pesosScore: row.pesosScore as unknown as PesosScore,
    };

    cache.set(empresaId, { regra, atualizadoEm: Date.now() });
    log.debug({ empresaId, versao: regra.versao }, 'regra de gamificação recarregada');
    return regra;
  }

  return entrada.regra;
}

/** Valores oficiais da fonte de verdade — usados só pelo seed, nunca pelo motor diretamente. */
export const REGUA_V1 = {
  regrasXp: {
    CHECKIN_DIARIO: 5,
    TREINAMENTO_CONCLUIDO: 20,
    QUIZ_APROVADO: 20,
    META_DIARIA_100: 100,
    META_DIARIA_110: 30,
    META_DIARIA_120: 50,
    META_DIARIA_150: 100,
    MELHORA_PA: 30,
    MELHORA_TICKET: 30,
    STREAK_3: 75,
    STREAK_5: 150,
    STREAK_10: 300,
  } satisfies Partial<Record<TipoEventoGamificacao, number>>,
  regrasMoeda: {
    TREINAMENTO_CONCLUIDO: 5,
    QUIZ_APROVADO: 5,
    META_DIARIA_100: 50,
    META_DIARIA_110: 20,
    META_DIARIA_120: 30,
    META_DIARIA_150: 50,
    MELHORA_PA: 10,
    MELHORA_TICKET: 10,
    STREAK_3: 25,
    STREAK_5: 50,
    STREAK_10: 100,
  } satisfies Partial<Record<TipoEventoGamificacao, number>>,
  pesosScore: {
    meta: 0.4,
    evolucao: 0.2,
    pa: 0.15,
    ticket: 0.15,
    consistencia: 0.1,
  } satisfies PesosScore,
};
