// Reseta o estado do CMS de Treinamento (Fatia 7.5C) antes de
// web/e2e/jornada-treinamento-cms.spec.ts: remove trilhas/aulas/questões
// criadas por rodadas anteriores do E2E (prefixo "e2e-") e devolve os 13
// Mandamentos ao estado estrutural limpo (DRAFT, sem conteúdo oficial) —
// sem isso, uma segunda execução encontraria conteúdo já PUBLISHED da
// rodada anterior. Roda só contra dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const trilhas = await prisma.academyTrack.findMany({ where: { code: { startsWith: 'e2e-' } }, select: { id: true } });
  const trilhaIds = trilhas.map((t) => t.id);

  const aulas = await prisma.academyLesson.findMany({ where: { trackId: { in: trilhaIds } }, select: { id: true } });
  const aulaIds = aulas.map((a) => a.id);

  const quizzes = await prisma.academyQuiz.findMany({ where: { lessonId: { in: aulaIds } }, select: { id: true } });
  const quizIds = quizzes.map((q) => q.id);

  const questoes = await prisma.academyQuestion.findMany({ where: { quizId: { in: quizIds } }, select: { id: true } });
  const questaoIds = questoes.map((q) => q.id);

  await prisma.academyProgress.deleteMany({ where: { lessonId: { in: aulaIds } } });
  await prisma.academyOption.deleteMany({ where: { questionId: { in: questaoIds } } });
  await prisma.academyQuestion.deleteMany({ where: { id: { in: questaoIds } } });
  await prisma.academyQuiz.deleteMany({ where: { id: { in: quizIds } } });
  await prisma.academyLesson.deleteMany({ where: { id: { in: aulaIds } } });
  await prisma.academyTrack.deleteMany({ where: { id: { in: trilhaIds } } });

  await prisma.mandamentoOficial.updateMany({
    data: { conteudoOficial: null, explicacaoOpcional: null, exemploOpcional: null, status: 'DRAFT', publishedAt: null, approvedBy: null, versao: 1 },
  });

  console.log(`Admin Training E2E reset: ${trilhaIds.length} trilha(s) de teste removida(s), 13 Mandamentos zerados.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
