// Visão simples de progresso (Fatia 6: "não construir BI avançado"). Backend
// é a autoridade — nunca calcula a partir de nada que o cliente envie.
import { prisma } from '../db';

export async function getProgressoGeral(vendedorId: string) {
  const [trilhas, progresso] = await Promise.all([
    prisma.academyTrack.findMany({ where: { active: true }, include: { aulas: { where: { active: true } } } }),
    prisma.academyProgress.findMany({ where: { vendedorId } }),
  ]);

  const progressoPorAula = new Map(progresso.map((p) => [p.lessonId, p]));

  const trilhasComProgresso = trilhas.map((t) => {
    const totalAulas = t.aulas.length;
    const concluidas = t.aulas.filter((a) => progressoPorAula.get(a.id)?.status === 'COMPLETED').length;
    return {
      id: t.id,
      title: t.title,
      totalAulas,
      aulasConcluidas: concluidas,
      percentual: totalAulas > 0 ? Math.round((concluidas / totalAulas) * 100) : 0,
    };
  });

  const totalAulasGeral = trilhas.reduce((acc, t) => acc + t.aulas.length, 0);
  const totalConcluidasGeral = trilhasComProgresso.reduce((acc, t) => acc + t.aulasConcluidas, 0);

  return {
    trilhas: trilhasComProgresso,
    totalAulas: totalAulasGeral,
    totalConcluidas: totalConcluidasGeral,
    percentualGeral: totalAulasGeral > 0 ? Math.round((totalConcluidasGeral / totalAulasGeral) * 100) : 0,
  };
}
