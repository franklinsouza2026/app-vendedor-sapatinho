/**
 * Prepara o ambiente E2E ISOLADO da Fase 1 (Onda 8, §28).
 *
 * Recria do zero SOMENTE o banco `app_vendedor_sapatinho_e2e`, o Redis db 3 e
 * a pasta .e2e/erp-controlado. Guardas: recusa rodar se o nome do banco não for
 * o do E2E, se NODE_ENV=production ou se o Redis apontar para o db 0.
 *
 *   npx tsx scripts/e2e-fase1/preparar.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { CODIGO_LOJA, DIR_ERP, envBackendE2E, IDS, NOME_BANCO_E2E, PESSOAS, RAIZ, SENHA_ADMIN, SENHA_VENDEDORA } from '../../web/e2e-fase1/ambiente';

async function main() {
  const env = envBackendE2E();
  const urlBanco = new URL(env.DATABASE_URL);
  if (urlBanco.pathname !== `/${NOME_BANCO_E2E}`) throw new Error('guarda: o preparo só roda no banco do E2E');
  if (process.env.NODE_ENV === 'production') throw new Error('guarda: nunca em produção');
  if (new URL(env.REDIS_URL).pathname !== '/3') throw new Error('guarda: Redis do E2E precisa ser o db 3');

  // 1) Banco: cria se não existir e aplica as migrations versionadas (nunca db push).
  const admin = new PrismaClient({ datasources: { db: { url: Object.assign(new URL(env.DATABASE_URL), { pathname: '/postgres' }).toString() } } });
  const existe = await admin.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${NOME_BANCO_E2E}`;
  if (!existe[0]?.n) await admin.$executeRawUnsafe(`CREATE DATABASE ${NOME_BANCO_E2E}`);
  await admin.$disconnect();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: RAIZ, env: { ...process.env, DATABASE_URL: env.DATABASE_URL }, stdio: 'ignore' });

  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

  // 2) Redis db 3 (fila, lockout, rate limit) e pasta do adapter controlado.
  const redis = new Redis(env.REDIS_URL);
  await redis.flushdb();
  redis.disconnect();
  rmSync(DIR_ERP, { recursive: true, force: true });
  mkdirSync(DIR_ERP, { recursive: true });

  // 3) Duas empresas (multiempresa real) com o provisionamento de produção.
  const { provisionarEmpresa } = await import('../../src/fase1/provisionamento');
  await provisionarEmpresa(prisma, { empresa: { id: IDS.empresaA, nome: 'E2E Empresa A' }, loja: { id: IDS.lojaA1, nome: 'A1 Recife', codigoErp: CODIGO_LOJA[IDS.lojaA1] }, admin: { nome: PESSOAS.adminA.nome, matriculaErp: PESSOAS.adminA.matricula, senha: SENHA_ADMIN } });
  await provisionarEmpresa(prisma, { empresa: { id: IDS.empresaB, nome: 'E2E Empresa B' }, loja: { id: IDS.lojaB1, nome: 'B1 Olinda', codigoErp: CODIGO_LOJA[IDS.lojaB1] }, admin: { nome: PESSOAS.adminB.nome, matriculaErp: PESSOAS.adminB.matricula, senha: SENHA_ADMIN } });
  await prisma.loja.createMany({
    data: [
      { id: IDS.lojaA2, empresaId: IDS.empresaA, nome: 'A2 Caruaru', codigoErp: CODIGO_LOJA[IDS.lojaA2] },
      { id: IDS.lojaEmpate, empresaId: IDS.empresaA, nome: 'A3 Empates', codigoErp: CODIGO_LOJA[IDS.lojaEmpate] },
    ],
  });

  const hash = await bcrypt.hash(SENHA_VENDEDORA, 10);
  for (const p of [PESSOAS.ana, PESSOAS.bia, PESSOAS.caio, PESSOAS.e1, PESSOAS.e2, PESSOAS.beto]) {
    const empresaId = p.loja === IDS.lojaB1 ? IDS.empresaB : IDS.empresaA;
    await prisma.vendedor.create({ data: { empresaId, lojaId: p.loja, matriculaErp: p.matricula, nome: p.nome, papel: 'VENDEDOR', status: 'ACTIVE', senhaHash: hash, admitidoEm: new Date('2025-01-02') } });
  }

  // 4) Integração CONTROLADO ativa por empresa, com todas as lojas vinculadas.
  for (const [integracaoId, empresaId, lojas] of [
    [IDS.integracaoA, IDS.empresaA, [IDS.lojaA1, IDS.lojaA2, IDS.lojaEmpate]],
    [IDS.integracaoB, IDS.empresaB, [IDS.lojaB1]],
  ] as const) {
    await prisma.integracao.create({ data: { id: integracaoId, empresaId, provedor: 'CONTROLADO', status: 'ATIVA', atualizadoPor: 'preparo-e2e' } });
    for (const lojaId of lojas) await prisma.integracaoLoja.create({ data: { integracaoId, lojaId, codigoExterno: CODIGO_LOJA[lojaId] } });
    mkdirSync(`${DIR_ERP}/${integracaoId}`, { recursive: true });
  }

  // 5) Histórico do Caio (anteontem R$ 300, ontem R$ 500) — entregue antes do
  //    primeiro sync (janela inicial de 48 h): ontem é recorde de melhor dia.
  const hojeLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const diaMenos = (n: number) => {
    const d = new Date(`${hojeLocal}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const vendaCaio = (id: string, quando: string, valor: number) => ({ tipo: 'VENDA', idExterno: id, lojaExterna: CODIGO_LOJA[IDS.lojaA2], vendedorExterno: PESSOAS.caio.matricula, ocorridoEm: quando, valor, itens: [{ referencia: 'E2E-REF-HIST', descricao: 'Histórico', categoria: 'Salto', quantidade: 1, pares: 1, valor }] });
  writeFileSync(
    `${DIR_ERP}/${IDS.integracaoA}/000-historico.json`,
    JSON.stringify([vendaCaio('hist-caio-1', `${diaMenos(2)}T23:59:00-03:00`, 300), vendaCaio('hist-caio-2', `${diaMenos(1)}T12:00:00-03:00`, 500)])
  );

  await prisma.$disconnect();
  console.log('ambiente E2E da Fase 1 pronto (banco, Redis db 3 e adapter controlado isolados)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
