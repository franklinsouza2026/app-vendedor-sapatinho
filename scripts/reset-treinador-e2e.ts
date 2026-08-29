// Reseta o estado do Treinador (conversas, mensagens) pra VEND001/VEND002
// antes do E2E de web/e2e/jornada-treinador.spec.ts — sem isso, uma segunda
// execução no mesmo dia contra o banco de dev compartilhado encontraria
// histórico de uma rodada anterior. Roda só contra dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
    select: { id: true },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.trainerMessage.deleteMany({ where: { conversation: { vendedorId: { in: ids } } } });
  await prisma.trainerConversation.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.aIUsage.deleteMany({ where: { vendedorId: { in: ids }, specialist: 'TRAINER' } });

  console.log(`Treinador E2E reset: limpo para ${ids.length} vendedor(es).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
