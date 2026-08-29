// Reseta o estado do Coach (check-in de hoje, conversas, mensagens, memória
// profissional, uso de IA) pra VEND001/VEND002 antes do E2E de
// web/e2e/jornada-coach.spec.ts — sem isso, o teste depende de "hoje ainda não
// ter check-in", o que quebra na segunda execução no mesmo dia contra o banco
// de dev compartilhado. Roda só contra dev, nunca contra produção.
//
// Também reseta o indicador de hoje pra um valor fixo: o worker de sync do
// ERP mock roda de hora em hora e vai empurrando o faturamento realizado pra
// cima ao longo do dia — se isso passar da meta (R$ 1000), o Coach responde
// "você já bateu a meta" em vez de "faltam R$X", quebrando a asserção do E2E
// que espera progresso parcial. Fixar aqui garante determinismo independente
// de quanto tempo o worker já rodou no dia.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const vendedores = await prisma.vendedor.findMany({
    where: { matriculaErp: { in: ['VEND001', 'VEND002'] } },
  });
  const ids = vendedores.map((v) => v.id);

  await prisma.aIUsage.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.coachMessage.deleteMany({ where: { conversation: { vendedorId: { in: ids } } } });
  await prisma.coachConversation.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.coachCheckIn.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.professionalMemory.deleteMany({ where: { vendedorId: { in: ids } } });

  const hoje = inicioDoDia(new Date());
  await prisma.indicadorRealizado.deleteMany({ where: { vendedorId: { in: ids }, dataHora: { gte: hoje } } });

  const vend001 = vendedores.find((v) => v.matriculaErp === 'VEND001');
  if (vend001) {
    const agora = new Date();
    await prisma.indicadorRealizado.create({
      data: {
        empresaId: vend001.empresaId,
        lojaId: vend001.lojaId,
        vendedorId: vend001.id,
        dataHora: agora,
        faturamento: 700,
        ticketMedio: 100,
        pa: 2,
        numAtendimentos: 7,
        fonteJobId: 'reset-coach-e2e',
      },
    });
  }

  console.log(`Coach E2E reset: limpo para ${ids.length} vendedor(es), indicador de hoje fixado pra VEND001.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
