// Reseta missões/desafios (e o progresso de Academia que os E2Es de missão
// completam) pra VEND001/VEND002 antes dos E2Es de web/e2e/jornada-missoes*.
// Sem isso, uma segunda execução no mesmo dia/semana encontraria a missão já
// COMPLETED da rodada anterior. Roda só contra dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
    select: { id: true },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.missionAssignment.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.challengeAssignment.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId: { in: ids }, tipoEvento: 'MISSAO' } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId: { in: ids }, tipoEvento: 'MISSAO' } });
  // Progresso de Academia também é resetado — os E2Es de missão completam
  // aulas/quizzes de verdade pra gerar a evidência real da missão.
  await prisma.academyProgress.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: { in: ['ACADEMIA_AULA', 'ACADEMIA_QUIZ'] } } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: { in: ['ACADEMIA_AULA', 'ACADEMIA_QUIZ'] } } });

  console.log(`Missões E2E reset: limpo para ${ids.length} vendedor(es).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
