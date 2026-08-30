// Reseta o progresso da Academia (aulas/quiz) pra VEND001/VEND002 antes do
// E2E de web/e2e/jornada-academia.spec.ts — sem isso, uma segunda execução
// no mesmo dia encontraria a aula já COMPLETED da rodada anterior. Roda só
// contra dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
    select: { id: true },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.academyProgress.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: { in: ['ACADEMIA_AULA', 'ACADEMIA_QUIZ'] } } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: { in: ['ACADEMIA_AULA', 'ACADEMIA_QUIZ'] } } });

  console.log(`Academia E2E reset: limpo para ${ids.length} vendedor(es).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
