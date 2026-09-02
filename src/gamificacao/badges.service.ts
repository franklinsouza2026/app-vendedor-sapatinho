// Badges (seção 20 da fonte de verdade). Catálogo v1 — deliberadamente restrito
// ao que é calculável com os dados desta fatia (documentado em
// 05-Decisoes-e-Tradeoffs.md): "Maior Evolução" (depende de temporada/ranking —
// Fatia 8), "Mestre do Treinamento" e badges de missão/temporada (Fatias 6-8)
// ficam de fora por enquanto — não bloqueiam o Gamification Engine.
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { publicarEventoFeed } from '../competicoes/feed.service';

const log = createLogger('gamificacao:badges');

export const CATALOGO_BADGES_V1 = [
  { codigo: 'PRIMEIRA_META', titulo: 'Primeira Meta', descricao: 'Bateu a meta diária pela primeira vez', categoria: 'META' },
  { codigo: 'STREAK_7', titulo: '7 Dias Consecutivos', descricao: 'Bateu a meta diária 7 dias seguidos', categoria: 'STREAK' },
  { codigo: 'PA_MASTER', titulo: 'PA Master', descricao: 'Melhorou o PA em relação à própria baseline', categoria: 'EVOLUCAO' },
  { codigo: 'TICKET_MASTER', titulo: 'Ticket Master', descricao: 'Melhorou o ticket médio em relação à própria baseline', categoria: 'EVOLUCAO' },
  // Fatia 8 — competições/temporadas (já previstos desde a Fatia 2, ver
  // comentário histórico acima). Concedidos só via `finalizarCompetition`,
  // nunca manualmente.
  { codigo: 'CAMPEAO_DA_SEASON', titulo: 'Campeão da Temporada', descricao: '1º lugar geral numa temporada', categoria: 'TEMPORADA' },
  { codigo: 'TOP_3', titulo: 'Pódio', descricao: 'Terminou entre os 3 primeiros de uma competição', categoria: 'TEMPORADA' },
  { codigo: 'MAIOR_EVOLUCAO', titulo: 'Maior Evolução', descricao: 'Maior evolução de Score Geral numa competição', categoria: 'EVOLUCAO' },
  { codigo: 'CONSISTENCIA', titulo: 'Consistência', descricao: 'Venceu uma competição de consistência', categoria: 'STREAK' },
  { codigo: 'CAMPEAO_DE_TREINAMENTO', titulo: 'Campeão de Treinamento', descricao: 'Venceu uma competição de treinamento', categoria: 'EVOLUCAO' },
  { codigo: 'DESTAQUE_DA_EQUIPE', titulo: 'Destaque da Equipe', descricao: 'Loja venceu uma competição entre lojas', categoria: 'TEMPORADA' },
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

  // Feed idempotente por sourceId (a própria concessão) — publicar de novo
  // numa concessão já existente (idempotencyKey repetida) nunca duplica
  // (Fatia 8, seção 40).
  await publicarEventoFeed({ eventType: 'BADGE_EARNED', sourceType: 'BADGE_CONCESSAO', sourceId: concessao.id, visibility: 'STORE', lojaId, subjectId: vendedorId, templateData: { badgeTitulo: badge.titulo } });

  log.info({ vendedorId, codigoBadge }, 'badge concedido (ou já existente — idempotente)');
  return concessao;
}
