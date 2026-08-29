// Reseta o estado do Coach (check-in de hoje, conversas, mensagens, memória
// profissional, uso de IA) pra VEND001/VEND002 antes do E2E de
// web/e2e/jornada-coach.spec.ts — sem isso, o teste depende de "hoje ainda não
// ter check-in", o que quebra na segunda execução no mesmo dia contra o banco
// de dev compartilhado. Roda só contra dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
    select: { id: true },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.aIUsage.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.coachMessage.deleteMany({ where: { conversation: { vendedorId: { in: ids } } } });
  await prisma.coachConversation.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.coachCheckIn.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.professionalMemory.deleteMany({ where: { vendedorId: { in: ids } } });

  console.log(`Coach E2E reset: limpo para ${ids.length} vendedor(es).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
