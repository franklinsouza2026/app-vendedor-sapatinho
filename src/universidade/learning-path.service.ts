// IntelligentLearningPathService (Fatia 7.5E, seção 37-39/44) — a SELEÇÃO
// BASE é sempre determinística (prioridade fixa por regra, seção 37); IA
// (ai-recommendation.service.ts) só pode reordenar/justificar dentro de
// opções já válidas, nunca inventar um item novo fora dessa lista.
import { Papel } from '@prisma/client';
import { prisma } from '../db';
import { calcularMatrizCompetencias } from './score-engine.service';

export interface ItemParaVoce {
  tipo: 'ONBOARDING' | 'REVIEW' | 'PDI' | 'MISSION' | 'CERTIFICATION' | 'GAP_TRACK';
  titulo: string;
  descricao: string;
  refId: string;
  href: string;
}

/**
 * "Para Você" (seção 39/63) — no máximo alguns itens, na ordem de
 * prioridade fixa da seção 37: 1) obrigatório (onboarding) 2) gap crítico
 * 3) revisão pendente (erro recente) 4) PDI ativo 5) missão 6) certificação
 * expirando. Nunca poluído — corta em `limite`.
 */
export async function montarParaVoce(vendedorId: string, papel: Papel, limite = 5): Promise<ItemParaVoce[]> {
  const itens: ItemParaVoce[] = [];

  // 1. Onboarding obrigatório — só se a trilha ainda não foi concluída.
  if (papel === 'VENDEDOR' || papel === 'GERENTE') {
    const trilhasOnboarding = await prisma.academyTrack.findMany({
      where: { onboarding: true, status: 'PUBLISHED', active: true },
      include: { aulas: { where: { status: 'PUBLISHED', active: true }, include: { progresso: { where: { vendedorId } } } } },
    });
    for (const t of trilhasOnboarding) {
      const pendente = t.aulas.some((a) => (a.progresso[0]?.status ?? 'NOT_STARTED') !== 'COMPLETED');
      if (pendente) itens.push({ tipo: 'ONBOARDING', titulo: `Trilha de integração: ${t.title}`, descricao: 'Trilha obrigatória pra quem está começando.', refId: t.id, href: `/academia/trilhas/${t.id}` });
    }
  }

  // 2. Gap crítico (prioridade HIGH na matriz).
  const matriz = await calcularMatrizCompetencias(vendedorId, papel);
  for (const c of matriz.filter((m) => m.priority === 'HIGH')) {
    itens.push({ tipo: 'GAP_TRACK', titulo: `Reforçar ${c.name}`, descricao: `Sua pontuação está abaixo da meta nesta competência.`, refId: c.competencyId, href: '/evoluir/minha-evolucao' });
  }

  // 3. Revisão pendente (spaced repetition).
  const revisoesPendentes = await prisma.reviewSchedule.count({ where: { userId: vendedorId, status: 'PENDING', nextReviewAt: { lte: new Date() } } });
  if (revisoesPendentes > 0) {
    itens.push({ tipo: 'REVIEW', titulo: `${revisoesPendentes} revisão(ões) pendente(s)`, descricao: 'Questões que você errou recentemente — vale revisar agora.', refId: 'review', href: '/evoluir/revisao' });
  }

  // 4. PDI ativo.
  const pdisAtivos = await prisma.developmentPlan.findMany({ where: { subjectUserId: vendedorId, status: 'ACTIVE' }, include: { competencia: true }, take: 3 });
  for (const p of pdisAtivos) {
    itens.push({ tipo: 'PDI', titulo: `Continuar seu plano: ${p.competencia.name}`, descricao: 'Você tem um plano de desenvolvimento em andamento.', refId: p.id, href: `/evoluir/meu-plano/${p.id}` });
  }

  // 5. Missões ativas.
  const missoesAtivas = await prisma.missionAssignment.count({ where: { vendedorId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } });
  if (missoesAtivas > 0) {
    itens.push({ tipo: 'MISSION', titulo: `${missoesAtivas} missão(ões) em andamento`, descricao: 'Complete suas missões de hoje.', refId: 'missoes', href: '/missoes' });
  }

  // 6. Certificações expirando.
  const expirando = await prisma.userCertification.findMany({ where: { userId: vendedorId, status: 'EXPIRING' }, include: { definicao: true } });
  for (const cert of expirando) {
    itens.push({ tipo: 'CERTIFICATION', titulo: `Certificação expirando: ${cert.definicao.name}`, descricao: 'Renove antes que expire.', refId: cert.id, href: '/evoluir/certificacoes' });
  }

  return itens.slice(0, limite);
}
