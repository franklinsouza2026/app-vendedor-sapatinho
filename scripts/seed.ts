import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const empresa = await prisma.empresa.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', nome: 'Sapatinho de Luxo' },
  });

  const loja = await prisma.loja.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      empresaId: empresa.id,
      nome: 'Loja Piloto',
      codigoErp: 'LOJA001',
    },
  });

  const senhaHashAdmin = await bcrypt.hash('admin123', 10);
  const senhaHashVendedor = await bcrypt.hash('vendedor123', 10);

  await prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: 'ADM001' } },
    update: {},
    create: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: 'ADM001',
      nome: 'Admin Piloto',
      senhaHash: senhaHashAdmin,
      papel: 'ADMIN',
    },
  });

  await prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: 'VEND001' } },
    update: {},
    create: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: 'VEND001',
      nome: 'Vendedor Piloto',
      senhaHash: senhaHashVendedor,
      papel: 'VENDEDOR',
    },
  });

  console.log('Seed concluído:');
  console.log(`  Loja: codigoErpLoja=${loja.codigoErp}`);
  console.log('  Admin:    matriculaErp=ADM001   senha=admin123');
  console.log('  Vendedor: matriculaErp=VEND001  senha=vendedor123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
