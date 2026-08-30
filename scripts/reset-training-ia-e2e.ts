// Reseta jobs/rascunhos da Training Intelligence Platform (Fatia 7.5D) antes
// de web/e2e/jornada-treinamento-ia.spec.ts — remove trilhas/aulas/questões/
// cenários gerados por jobs de rodadas anteriores e os próprios jobs (fontes/
// achados de governança somem em cascata via FK). Roda só contra dev, nunca
// contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aulas = await prisma.academyLesson.findMany({ where: { trainingJobId: { not: null } }, select: { id: true, trackId: true } });
  const aulaIds = aulas.map((a) => a.id);
  const trackIds = [...new Set(aulas.map((a) => a.trackId))];

  const quizzes = await prisma.academyQuiz.findMany({ where: { lessonId: { in: aulaIds } }, select: { id: true } });
  const quizIds = quizzes.map((q) => q.id);
  const questoesGeradas = await prisma.academyQuestion.findMany({ where: { trainingJobId: { not: null } }, select: { id: true } });
  const questaoIds = questoesGeradas.map((q) => q.id);

  await prisma.academyProgress.deleteMany({ where: { lessonId: { in: aulaIds } } });
  await prisma.academyOption.deleteMany({ where: { questionId: { in: questaoIds } } });
  await prisma.academyQuestion.deleteMany({ where: { id: { in: questaoIds } } });
  await prisma.academyQuiz.deleteMany({ where: { id: { in: quizIds } } });
  await prisma.academyLesson.deleteMany({ where: { id: { in: aulaIds } } });
  await prisma.academyTrack.deleteMany({ where: { id: { in: trackIds } } });

  const jobs = await prisma.trainingIntelligenceJob.deleteMany({}); // cascade: sources/findings/cenarios

  console.log(`Training IA E2E reset: ${aulaIds.length} aula(s) e ${jobs.count} job(s) de teste removidos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
