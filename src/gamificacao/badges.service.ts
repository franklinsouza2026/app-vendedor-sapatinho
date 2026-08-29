// Badges (seção 20 da fonte de verdade). Catálogo v1 — deliberadamente restrito
// ao que é calculável com os dados desta fatia (documentado em
// 05-Decisoes-e-Tradeoffs.md): "Maior Evolução" (depende de temporada/ranking —
// Fatia 8), "Mestre do Treinamento" e badges de missão/temporada (Fatias 6-8)
// ficam de fora por enquanto — não bloqueiam o Gamification Engine.
import { prisma } from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:badges');

export const CATALOGO_BADGES_V1 = [
  { codigo: 'PRIMEIRA_META', titulo: 'Primeira Meta', descricao: 'Bateu a meta diária pela primeira vez', categoria: 'META' },
  { codigo: 'STREAK_7', titulo: '7 Dias Consecutivos', descricao: 'Bateu a meta diária 7 dias seguidos', categoria: 'STREAK' },
  { codigo: 'PA_MASTER', titulo: 'PA Master', descricao: 'Melhorou o PA em relação à própria baseline', categoria: 'EVOLUCAO' },
  { codigo: 'TICKET_MASTER', titulo: 'Ticket Master', descricao: 'Melhorou o ticket médio em relação à própria baseline', categoria: 'EVOLUCAO' },
] as const;

export type CodigoBadge = (typeof CATALOGO_BADGES_V1)[number]['codigo'];

/** Concede um badge de forma idempotente (mesma idempotencyKey nunca duplica). */
export async function concederBadge(
  empresaId: string,
  lojaId: string,
  vendedorId: string,
  codigoBadge: CodigoBadge,
  idempotencyKey: string
) {
  const badge = await prisma.badge.findUnique({ where: { codigo: codigoBadge } });
  if (!badge) {
    log.warn({ codigoBadge }, 'badge não encontrado no catálogo — rode o seed');
    return null;
  }

  const concessao = await prisma.badgeConcessao.upsert({
    where: { idempotencyKey },
    update: {},
    create: { empresaId, lojaId, vendedorId, badgeId: badge.id, idempotencyKey },
  });

  log.info({ vendedorId, codigoBadge }, 'badge concedido (ou já existente — idempotente)');
  return concessao;
}
