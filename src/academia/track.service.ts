// Trilhas da Academia — catálogo GLOBAL (mesmo raciocínio de SimulationScenario/
// Badge). Progresso é sempre por vendedor (AcademyProgress), nunca global.
// CMS (Fatia 7.5C, seção 10/21): só conteúdo PUBLISHED chega ao vendedor —
// DRAFT/REVIEW_PENDING/APPROVED/ARCHIVED nunca aparecem aqui, mesmo por ID
// direto (getTrilhaDetalhada usa o mesmo filtro).
import { Papel } from '@prisma/client';
import { prisma } from '../db';

function publicoPermitido(papel: Papel) {
  return papel === 'GERENTE' ? ['MANAGER' as const, 'BOTH' as const] : ['SELLER' as const, 'BOTH' as const];
}

export async function listarTrilhas(vendedorId: string, papel: Papel = 'VENDEDOR') {
  const trilhas = await prisma.academyTrack.findMany({
    where: { active: true, status: 'PUBLISHED', audience: { in: publicoPermitido(papel) } },
    orderBy: { sortOrder: 'asc' },
    include: {
      aulas: {
        where: { active: true, status: 'PUBLISHED', audience: { in: publicoPermitido(papel) } },
        orderBy: { sortOrder: 'asc' },
        include: { quiz: { select: { id: true } }, progresso: { where: { vendedorId } } },
      },
    },
  });

  return trilhas.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    aulas: t.aulas.map((a) => ({
      id: a.id,
      code: a.code,
      title: a.title,
      estimatedMinutes: a.estimatedMinutes,
      hasQuiz: !!a.quiz,
      status: a.progresso[0]?.status ?? 'NOT_STARTED',
    })),
  }));
}

export async function getTrilhaDetalhada(trackId: string, vendedorId: string, papel: Papel = 'VENDEDOR') {
  const trilha = await prisma.academyTrack.findFirst({
    where: { id: trackId, active: true, status: 'PUBLISHED', audience: { in: publicoPermitido(papel) } },
    include: {
      aulas: {
        where: { active: true, status: 'PUBLISHED', audience: { in: publicoPermitido(papel) } },
        orderBy: { sortOrder: 'asc' },
        include: { quiz: { select: { id: true } }, progresso: { where: { vendedorId } } },
      },
    },
  });
  if (!trilha) return null;

  return {
    id: trilha.id,
    code: trilha.code,
    title: trilha.title,
    description: trilha.description,
    aulas: trilha.aulas.map((a) => ({
      id: a.id,
      code: a.code,
      title: a.title,
      description: a.description,
      estimatedMinutes: a.estimatedMinutes,
      hasQuiz: !!a.quiz,
      status: a.progresso[0]?.status ?? 'NOT_STARTED',
    })),
  };
}
