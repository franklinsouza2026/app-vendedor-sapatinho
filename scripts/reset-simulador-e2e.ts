// Reseta o estado do Simulador (sessões, mensagens, avaliações, recompensas)
// pra VEND001/VEND002 antes do E2E de web/e2e/jornada-simulador.spec.ts — sem
// isso, uma segunda execução no mesmo dia encontraria a sessão ativa da
// rodada anterior (índice único parcial impede uma nova). Roda só contra
// dev, nunca contra produção.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
    select: { id: true },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.simulationEvaluation.deleteMany({ where: { sessao: { vendedorId: { in: ids } } } });
  await prisma.simulationMessage.deleteMany({ where: { sessao: { vendedorId: { in: ids } } } });
  await prisma.simulationSession.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.aIUsage.deleteMany({ where: { vendedorId: { in: ids }, specialist: 'SIMULATOR' } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: 'SIMULACAO' } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId: { in: ids }, referenciaTipo: 'SIMULACAO' } });

  console.log(`Simulador E2E reset: limpo para ${ids.length} vendedor(es).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
