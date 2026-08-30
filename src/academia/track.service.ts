// Trilhas da Academia — catálogo GLOBAL (mesmo raciocínio de SimulationScenario/
// Badge). Progresso é sempre por vendedor (AcademyProgress), nunca global.
import { prisma } from '../db';

export async function listarTrilhas(vendedorId: string) {
  const trilhas = await prisma.academyTrack.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      aulas: {
        where: { active: true },
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

export async function getTrilhaDetalhada(trackId: string, vendedorId: string) {
  const trilha = await prisma.academyTrack.findUnique({
    where: { id: trackId },
    include: {
      aulas: {
        where: { active: true },
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
