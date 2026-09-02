import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { REGUA_V1 } from '../src/gamificacao/regras.service';
import { CATALOGO_BADGES_V1 } from '../src/gamificacao/badges.service';
import { seedPlaybookInicialSeNaoExistir } from '../src/treinador/playbook-seed';
import { seedCenariosSimulador } from '../src/simulador/scenario-seed';
import { seedConteudoAcademia } from '../src/academia/content-seed';
import { seedMissoesEDesafios } from '../src/missoes/catalogo-seed';
import { seedEstruturaMandamentos } from '../src/academia/mandamentos.service';
import { env } from '../src/config';

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
  const senhaHashGerente = await bcrypt.hash('gerente123', 10);

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

  // Segundo vendedor — usado pelo E2E de isolamento entre vendedores (ranking
  // entre lojas/pessoas e privacidade de conversas do Coach exigem >1 vendedor).
  await prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: 'VEND002' } },
    update: {},
    create: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: 'VEND002',
      nome: 'Segundo Vendedor',
      senhaHash: senhaHashVendedor,
      papel: 'VENDEDOR',
    },
  });

  // Gerente fixo de dev (Fatia 7.5A/7.5E: escopo de loja, "Minha Equipe") —
  // antes só existia GERENTE ad hoc criado por spec de E2E, sem matrícula
  // estável pra login manual.
  await prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: 'GER001' } },
    update: {},
    create: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: 'GER001',
      nome: 'Gerente Piloto',
      senhaHash: senhaHashGerente,
      papel: 'GERENTE',
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

  await prisma.aIBudgetConfig.upsert({
    where: { empresaId: empresa.id },
    update: {},
    create: {
      empresaId: empresa.id,
      monthlyLimitUSD: env.AI_MONTHLY_BUDGET_USD_DEFAULT,
      dailyMessageLimitPerSeller: env.AI_DAILY_MESSAGE_LIMIT_DEFAULT,
      updatedBy: 'seed',
    },
  });

  const playbook = await seedPlaybookInicialSeNaoExistir(empresa.id, 'seed');
  const totalCenarios = await seedCenariosSimulador();
  const conteudoAcademia = await seedConteudoAcademia();
  const conteudoMissoes = await seedMissoesEDesafios();
  const totalMandamentos = await seedEstruturaMandamentos();

  console.log('Seed concluído:');
  console.log(`  Loja: codigoErpLoja=${loja.codigoErp}`);
  console.log('  Admin:    matriculaErp=ADM001   senha=admin123');
  console.log('  Vendedor: matriculaErp=VEND001  senha=vendedor123');
  console.log('  Vendedor: matriculaErp=VEND002  senha=vendedor123');
  console.log('  Gerente:  matriculaErp=GER001   senha=gerente123');
  console.log('  Meta diária de VEND001: R$ 1000');
  console.log(`  Playbook: "${playbook.nome}" v${playbook.versao} (PUBLISHED)`);
  console.log(`  Simulador: ${totalCenarios} cenários`);
  console.log(`  Academia: ${conteudoAcademia.trilhas} trilhas, ${conteudoAcademia.aulas} aulas`);
  console.log(`  Missões: ${conteudoMissoes.missoes} definições, Desafios: ${conteudoMissoes.desafios} definições`);
  console.log(`  13 Mandamentos: estrutura garantida (${totalMandamentos} linhas, conteúdo oficial pendente de cadastro pelo Admin)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
