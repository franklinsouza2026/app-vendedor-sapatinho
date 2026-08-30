// Reseta a configuração de IA (Fatia 7.5B) da empresa seedada antes dos E2Es
// de web/e2e/jornada-admin-ia.spec.ts — garante que cada rodada começa sem
// credencial configurada e com MOCK ativo, sem acumular estado de rodadas
// anteriores. Roda só contra dev, nunca produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: '00000000-0000-0000-0000-000000000001' } });

  await prisma.aIProviderCredential.deleteMany({ where: { empresaId: empresa.id } });
  await prisma.aIProviderHealth.deleteMany({ where: { empresaId: empresa.id } });
  await prisma.companyAIConfiguration.deleteMany({ where: { empresaId: empresa.id } });

  console.log('Admin IA E2E reset: configuração de IA limpa pra empresa seedada.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
