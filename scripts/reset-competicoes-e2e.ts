// Reseta dados de Competições/Temporadas (Fatia 8) antes dos E2Es — seasons/
// competitions/ligas/reconhecimentos de teste (code/matrícula prefixados com
// "e2e-"), e participações de VEND001/VEND002/GER001. Roda só contra dev,
// nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({ where: { matriculaErp: { in: ['VEND001', 'VEND002', 'GER001'] } }, select: { id: true } });
  const ids = vendedores.map((v) => v.id);

  await prisma.recognition.deleteMany({ where: { OR: [{ authorId: { in: ids } }, { subjectId: { in: ids } }] } });
  await prisma.feedEvent.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { subjectId: { in: ids } }] } });

  const competitions = await prisma.competition.findMany({ where: { code: { startsWith: 'e2e-' } }, select: { id: true } });
  const competitionIds = competitions.map((c) => c.id);
  await prisma.competitionResult.deleteMany({ where: { competitionId: { in: competitionIds } } });
  await prisma.competitionParticipant.deleteMany({ where: { competitionId: { in: competitionIds } } });
  await prisma.competition.deleteMany({ where: { id: { in: competitionIds } } });

  const seasons = await prisma.season.findMany({ where: { code: { startsWith: 'e2e-' } }, select: { id: true } });
  const seasonIds = seasons.map((s) => s.id);
  await prisma.seasonPointLedger.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.leagueMembership.deleteMany({ where: { seasonId: { in: seasonIds } } });
  await prisma.season.deleteMany({ where: { id: { in: seasonIds } } });

  await prisma.leagueMembership.deleteMany({ where: { participantType: 'SELLER', participantId: { in: ids } } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId: { in: ids }, tipoEvento: 'COMPETICAO' } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId: { in: ids }, tipoEvento: 'COMPETICAO' } });

  console.log(`Competições E2E reset: limpo para ${ids.length} vendedor(es), ${competitionIds.length} competição(ões) e ${seasonIds.length} season(s) de teste removidas.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
