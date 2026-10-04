/**
 * Provisiona uma EMPRESA para o piloto (D8): empresa, primeira loja, primeiro
 * ADMIN, régua de gamificação v1 e catálogo de badges. Nenhum dado de
 * demonstração. Idempotente (rodar de novo não duplica).
 *
 * Tudo vem de variáveis de ambiente — a senha inicial NUNCA é impressa:
 *   PROV_EMPRESA_NOME     ex.: "Sapatinho de Luxo"
 *   PROV_EMPRESA_TZ       opcional, padrão America/Sao_Paulo
 *   PROV_LOJA_NOME        ex.: "Caruaru Shopping"
 *   PROV_LOJA_CODIGO      código da loja no ERP (o mesmo que a Linx usará)
 *   PROV_ADMIN_NOME
 *   PROV_ADMIN_MATRICULA
 *   PROV_ADMIN_SENHA      mínimo 12 caracteres; troque no primeiro acesso
 *
 *   npx tsx scripts/provisionar-empresa.ts
 *   (em produção: docker compose run --rm migrate npx tsx scripts/provisionar-empresa.ts)
 */
import { PrismaClient } from '@prisma/client';
import { provisionarEmpresa } from '../src/fase1/provisionamento';
import { fusoValido } from '../src/tempo/dia';

function exigir(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) {
    console.error(`faltou ${nome}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const dados = {
    empresa: { nome: exigir('PROV_EMPRESA_NOME'), timezone: process.env.PROV_EMPRESA_TZ?.trim() || 'America/Sao_Paulo' },
    loja: { nome: exigir('PROV_LOJA_NOME'), codigoErp: exigir('PROV_LOJA_CODIGO') },
    admin: { nome: exigir('PROV_ADMIN_NOME'), matriculaErp: exigir('PROV_ADMIN_MATRICULA'), senha: exigir('PROV_ADMIN_SENHA') },
  };
  if (!fusoValido(dados.empresa.timezone)) throw new Error(`fuso inválido: ${dados.empresa.timezone}`);

  const prisma = new PrismaClient();
  try {
    const existente = await prisma.empresa.findFirst({ where: { nome: dados.empresa.nome } });
    const r = await provisionarEmpresa(prisma, { ...dados, empresa: { ...dados.empresa, id: existente?.id } });
    console.log('empresa provisionada:');
    console.log(`  empresaId: ${r.empresa.id}   (use em VITE_EMPRESA_ID se houver mais de uma empresa)`);
    console.log(`  loja:      ${r.loja.nome} [${r.loja.codigoErp}]`);
    console.log(`  admin:     ${r.admin.nome} (matrícula ${r.admin.matriculaErp}) — senha definida pela variável, não exibida`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
