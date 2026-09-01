// Escolas da Universidade (Fatia 7.5E, seção 4) — administrável, nunca um
// universo fechado no código. Seeds/defaults abaixo são só fundação inicial
// (seção 4), o Admin pode criar/editar/arquivar livremente.
import { PublicoConteudo } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { UniversidadeError } from './constantes';

export const ESCOLAS_SEED_V1 = [
  { code: 'vendas', name: 'Escola de Vendas', description: 'Técnicas de venda, abordagem e fechamento.', audience: 'SELLER' as const },
  { code: 'atendimento', name: 'Escola de Atendimento', description: 'Experiência do cliente e excelência no atendimento.', audience: 'SELLER' as const },
  { code: 'produto', name: 'Escola de Produto', description: 'Conhecimento técnico sobre o catálogo de produtos.', audience: 'SELLER' as const },
  { code: 'performance', name: 'Escola de Performance', description: 'Indicadores, metas e evolução de resultado.', audience: 'BOTH' as const },
  { code: 'organizacao', name: 'Escola de Organização e Produtividade', description: 'Rotina, prioridades e produtividade pessoal.', audience: 'BOTH' as const },
  { code: 'desenvolvimento-pessoal', name: 'Escola de Desenvolvimento Pessoal e Financeiro', description: 'Educação financeira e crescimento pessoal.', audience: 'BOTH' as const },
  { code: 'lideranca', name: 'Escola de Liderança', description: 'Fundamentos de liderança para gerentes.', audience: 'MANAGER' as const },
  { code: 'gestao-equipes', name: 'Escola de Gestão de Equipes', description: 'Gestão de pessoas, feedback e metas de equipe.', audience: 'MANAGER' as const },
];

/** Idempotente — nunca sobrescreve edições do Admin numa escola já existente. */
export async function seedEscolasV1() {
  for (const [i, escola] of ESCOLAS_SEED_V1.entries()) {
    await prisma.escolaUniversidade.upsert({
      where: { code: escola.code },
      update: {},
      create: { ...escola, sortOrder: i },
    });
  }
}

export async function listarEscolas(somenteAtivas = false) {
  return prisma.escolaUniversidade.findMany({
    where: somenteAtivas ? { active: true } : undefined,
    orderBy: { sortOrder: 'asc' },
  });
}

export async function criarEscola(dados: { code: string; name: string; description: string; audience?: PublicoConteudo; sortOrder?: number }, actorId: string) {
  const escola = await prisma.escolaUniversidade.create({ data: dados });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'UNIVERSITY_SCHOOL_CREATED', actorId, metadata: { escolaId: escola.id } });
  return escola;
}

export async function atualizarEscola(
  id: string,
  dados: Partial<{ name: string; description: string; audience: PublicoConteudo; sortOrder: number; active: boolean }>,
  actorId: string
) {
  const atual = await prisma.escolaUniversidade.findUnique({ where: { id } });
  if (!atual) throw new UniversidadeError('not_found', 'escola não encontrada');
  const escola = await prisma.escolaUniversidade.update({ where: { id }, data: dados });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'UNIVERSITY_SCHOOL_UPDATED', actorId, metadata: { escolaId: id } });
  return escola;
}

// Catálogo é global (Decisão 1 do vault) — mesma resolução de "empresa
// única" já usada em admin-content.service.ts (Fatia 7.5C).
let empresaUnicaCache: string | null = null;
export async function resolverEmpresaUnica(): Promise<string> {
  if (empresaUnicaCache) return empresaUnicaCache;
  const empresa = await prisma.empresa.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  empresaUnicaCache = empresa.id;
  return empresaUnicaCache;
}
