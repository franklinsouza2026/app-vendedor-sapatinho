// Reseta o estado de identidade/admin (Fatia 7.5A) antes dos E2Es de
// web/e2e/jornada-identidade-*.spec.ts: remove qualquer vendedor de teste
// criado por uma rodada anterior (prefixo E2E-), tokens de ativação órfãos e
// eventos de auditoria associados, e garante que VEND002 volte pro estado
// ACTIVE (usado pelo E2E de bloqueio). Roda só contra dev, nunca produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedoresTeste = await prisma.vendedor.findMany({
    where: { matriculaErp: { startsWith: 'E2E-' } },
    select: { id: true },
  });
  const ids = vendedoresTeste.map((v) => v.id);

  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.activationToken.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.externalIdentity.deleteMany({ where: { vendedorId: { in: ids } } });
  // Visitar a Home já atribui missões/desafios do dia (efeito colateral de
  // GET /missoes/ativas) — precisa limpar antes de apagar o vendedor, senão
  // a FK de mission_assignment/challenge_assignment barra o delete.
  await prisma.missionAssignment.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.challengeAssignment.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.vendedor.deleteMany({ where: { id: { in: ids } } });

  // VEND002 é reaproveitado pelo E2E de bloqueio — garante que começa ACTIVE.
  await prisma.vendedor.updateMany({ where: { matriculaErp: 'VEND002' }, data: { status: 'ACTIVE' } });

  console.log(`Identidade E2E reset: removidos ${ids.length} vendedor(es) de teste, VEND002 garantido ACTIVE.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
