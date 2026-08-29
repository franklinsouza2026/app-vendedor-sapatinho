import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { REGUA_V1 } from '../src/gamificacao/regras.service';
import { CATALOGO_BADGES_V1 } from '../src/gamificacao/badges.service';

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

  const vendedorPiloto = await prisma.vendedor.findUniqueOrThrow({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: 'VEND001' } },
  });
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  await prisma.meta.upsert({
    where: { vendedorId_tipo_periodo_referencia: { vendedorId: vendedorPiloto.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: hoje } },
    update: {},
    create: {
      empresaId: empresa.id,
      lojaId: loja.id,
      vendedorId: vendedorPiloto.id,
      tipo: 'FATURAMENTO',
      periodo: 'DIA',
      referencia: hoje,
      valorMeta: 1000,
    },
  });

  await prisma.regraGamificacaoVersao.upsert({
    where: { empresaId_versao: { empresaId: empresa.id, versao: 1 } },
    update: {},
    create: {
      empresaId: empresa.id,
      versao: 1,
      ativo: true,
      regrasXp: REGUA_V1.regrasXp,
      regrasMoeda: REGUA_V1.regrasMoeda,
      pesosScore: REGUA_V1.pesosScore,
      criadoPor: 'seed',
    },
  });

  for (const badge of CATALOGO_BADGES_V1) {
    await prisma.badge.upsert({
      where: { codigo: badge.codigo },
      update: {},
      create: badge,
    });
  }

  console.log('Seed concluído:');
  console.log(`  Loja: codigoErpLoja=${loja.codigoErp}`);
  console.log('  Admin:    matriculaErp=ADM001   senha=admin123');
  console.log('  Vendedor: matriculaErp=VEND001  senha=vendedor123');
  console.log('  Meta diária de VEND001: R$ 1000');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
