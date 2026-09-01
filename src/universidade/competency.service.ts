// Modelo de Competência (Fatia 7.5E, seção 5-7) — administrável, catálogos
// abaixo são só fundação inicial (seed), nunca um universo fechado exigido
// pelo código: qualquer `code` novo funciona igual a um dos seeds.
import { Papel, PublicoConteudo, StatusCompetencia } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { TARGET_SCORE_DEFAULT, UniversidadeError } from './constantes';

export const COMPETENCIAS_VENDEDOR_SEED_V1 = [
  'ABORDAGEM',
  'SONDAGEM',
  'ARGUMENTACAO',
  'QUEBRA_DE_OBJECOES',
  'VENDA_COMPLEMENTAR',
  'FECHAMENTO',
  'COMUNICACAO',
  'CONHECIMENTO_DE_PRODUTO',
  'ORGANIZACAO',
  'DISCIPLINA_COMERCIAL',
  '13_MANDAMENTOS',
].map((code) => ({ code, name: code.replaceAll('_', ' ').toLowerCase(), audience: 'SELLER' as const, category: 'COMERCIAL' }));

export const COMPETENCIAS_GERENTE_SEED_V1 = [
  'LIDERANCA',
  'FEEDBACK',
  'GESTAO_DE_METAS',
  'GESTAO_DE_EQUIPE',
  'ONE_ON_ONE',
  'GESTAO_DE_CONFLITOS',
  'MOTIVACAO',
  'DESENVOLVIMENTO_DE_PESSOAS',
  'DELEGACAO',
  'COMUNICACAO_GERENCIAL',
  'ORGANIZACAO_GERENCIAL',
].map((code) => ({ code, name: code.replaceAll('_', ' ').toLowerCase(), audience: 'MANAGER' as const, category: 'LIDERANCA' }));

/** Idempotente — nunca sobrescreve edições do Admin (nome/descrição/status)
 * numa competência já existente. */
export async function seedCompetenciasV1() {
  for (const c of [...COMPETENCIAS_VENDEDOR_SEED_V1, ...COMPETENCIAS_GERENTE_SEED_V1]) {
    await prisma.competency.upsert({
      where: { code: c.code },
      update: {},
      create: { code: c.code, name: c.name, description: `Competência: ${c.name}`, audience: c.audience, category: c.category },
    });
  }
}

export async function listarCompetencias(filtros?: { audience?: PublicoConteudo; status?: StatusCompetencia }) {
  return prisma.competency.findMany({ where: filtros, orderBy: { name: 'asc' } });
}

export async function buscarCompetencia(id: string) {
  const c = await prisma.competency.findUnique({ where: { id } });
  if (!c) throw new UniversidadeError('not_found', 'competência não encontrada');
  return c;
}

export async function criarCompetencia(dados: { code: string; name: string; description: string; audience?: PublicoConteudo; category?: string }, actorId: string) {
  const competencia = await prisma.competency.create({ data: dados });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETENCY_CREATED', actorId, metadata: { competencyId: competencia.id } });
  return competencia;
}

export async function atualizarCompetencia(
  id: string,
  dados: Partial<{ name: string; description: string; audience: PublicoConteudo; category: string; status: StatusCompetencia }>,
  actorId: string
) {
  await buscarCompetencia(id);
  const competencia = await prisma.competency.update({ where: { id }, data: dados });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETENCY_UPDATED', actorId, metadata: { competencyId: id } });
  return competencia;
}

/** Target por papel (seção 16) — se não configurado, `TARGET_SCORE_DEFAULT`
 * é o fallback documentado (nunca apresentado como meta validada). */
export async function getTargetEfetivo(competencyId: string, papel: Papel): Promise<number> {
  const target = await prisma.competencyTarget.findUnique({ where: { competencyId_papel: { competencyId, papel } } });
  if (target && target.active) return target.targetScore;
  return TARGET_SCORE_DEFAULT;
}

export async function definirTarget(competencyId: string, papel: Papel, targetScore: number, actorId: string) {
  await buscarCompetencia(competencyId);
  const target = await prisma.competencyTarget.upsert({
    where: { competencyId_papel: { competencyId, papel } },
    update: { targetScore, active: true, version: { increment: 1 } },
    create: { competencyId, papel, targetScore },
  });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'COMPETENCY_TARGET_CHANGED', actorId, metadata: { competencyId, papel, targetScore } });
  return target;
}

export async function listarTargets(competencyId: string) {
  return prisma.competencyTarget.findMany({ where: { competencyId } });
}
