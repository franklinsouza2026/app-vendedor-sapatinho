/**
 * Ambiente E2E ISOLADO da Fase 1 (Onda 8, §28). Nunca toca o banco/Redis de
 * desenvolvimento:
 *   - banco  app_vendedor_sapatinho_e2e (mesmo Postgres local, outro database);
 *   - Redis  db 3 (fila, lockout e rate limit separados do dev, que usa o db 0);
 *   - API    :3020, worker próprio, Vite :5183;
 *   - adapter CONTROLADO lendo de .e2e/erp-controlado/.
 *
 * Credenciais do Postgres vêm do .env local (nunca impressas). Os segredos
 * abaixo são DERIVADOS e servem só para este ambiente descartável.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync as lerArquivo } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Raiz do repositório (onde está prisma/schema.prisma), a partir do diretório atual. */
function acharRaiz(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'prisma', 'schema.prisma'))) {
    const acima = dirname(dir);
    if (acima === dir) throw new Error('raiz do repositório não encontrada');
    dir = acima;
  }
  return dir;
}

export const RAIZ = acharRaiz();
export const NOME_BANCO_E2E = 'app_vendedor_sapatinho_e2e';
export const PORTA_API = 3020;
export const PORTA_WEB = 5183;
/** Build de produção servido por `vite preview` (E25: PWA instalado). */
export const PORTA_PWA = 5184;
/** Servidor estático da spec de atualização do PWA (troca a versão A→B na mesma origem). */
export const PORTA_PWA_DEPLOY = 5185;
export const DIR_ERP = join(RAIZ, '.e2e', 'erp-controlado');

/** IDs fixos — specs e preparo concordam sem consultar o banco. */
export const IDS = {
  empresaA: 'e2e00000-0000-4000-8000-00000000000a',
  empresaB: 'e2e00000-0000-4000-8000-00000000000b',
  lojaA1: 'e2e00000-0000-4000-8000-0000000000a1',
  lojaA2: 'e2e00000-0000-4000-8000-0000000000a2',
  lojaEmpate: 'e2e00000-0000-4000-8000-0000000000a3',
  lojaB1: 'e2e00000-0000-4000-8000-0000000000b1',
  integracaoA: 'e2e00000-0000-4000-8000-00000000c0a0',
  integracaoB: 'e2e00000-0000-4000-8000-00000000c0b0',
} as const;

export const SENHA_ADMIN = 'e2e-admin-senha-longa';
export const SENHA_VENDEDORA = 'e2e-vendedora-123';

/** Vendedoras pré-ativadas (com senha). Matrícula = código no ERP. */
export const PESSOAS = {
  adminA: { matricula: 'E2E-ADM-A', loja: IDS.lojaA1, nome: 'Admin Empresa A' },
  adminB: { matricula: 'E2E-ADM-B', loja: IDS.lojaB1, nome: 'Admin Empresa B' },
  ana: { matricula: 'E2E-ANA', loja: IDS.lojaA1, nome: 'Ana Recife' },
  bia: { matricula: 'E2E-BIA', loja: IDS.lojaA1, nome: 'Bia Recife' },
  caio: { matricula: 'E2E-CAIO', loja: IDS.lojaA2, nome: 'Caio Caruaru' },
  e1: { matricula: 'E2E-EMP-1', loja: IDS.lojaEmpate, nome: 'Duda Empate' },
  e2: { matricula: 'E2E-EMP-2', loja: IDS.lojaEmpate, nome: 'Eva Empate' },
  beto: { matricula: 'E2E-BETO-B', loja: IDS.lojaB1, nome: 'Beto Empresa B' },
} as const;

export const CODIGO_LOJA: Record<string, string> = {
  [IDS.lojaA1]: 'E2E-A1',
  [IDS.lojaA2]: 'E2E-A2',
  [IDS.lojaEmpate]: 'E2E-A3',
  [IDS.lojaB1]: 'E2E-B1',
};

function derivado(rotulo: string, tamanho = 64) {
  return createHash('sha256').update(`vendedor-ia-e2e-isolado:${rotulo}`).digest('hex').slice(0, tamanho);
}

function lerEnvLocal(): Record<string, string> {
  const texto = lerArquivo(join(RAIZ, '.env'), 'utf8');
  const env: Record<string, string> = {};
  for (const linha of texto.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function urlBancoE2E(): string {
  const base = process.env.E2E_DATABASE_URL ?? lerEnvLocal().DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL ausente no .env local');
  const url = new URL(base);
  url.pathname = `/${NOME_BANCO_E2E}`;
  return url.toString();
}

export function urlRedisE2E(): string {
  const base = process.env.E2E_REDIS_URL ?? lerEnvLocal().REDIS_URL ?? 'redis://localhost:6380';
  const url = new URL(base);
  url.pathname = '/3';
  return url.toString();
}

/** Variáveis da API e do worker do E2E (explícitas — o backend não lê .env sozinho). */
export function envBackendE2E(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    PORT: String(PORTA_API),
    LOG_LEVEL: 'warn',
    DATABASE_URL: urlBancoE2E(),
    REDIS_URL: urlRedisE2E(),
    JWT_SECRET: derivado('jwt'),
    CPF_HASH_SECRET: derivado('cpf'),
    INTEGRATION_SECRETS_ENCRYPTION_KEY: derivado('integracoes'),
    AI_PROVIDER: 'mock',
    ERP_CONTROLADO_DIR: DIR_ERP,
    // Sync automático raro: o E2E dispara sync pelo botão/endpoint e verifica o efeito.
    ERP_SYNC_CRON: '0 3 1 1 *',
    CORS_ORIGINS: `http://localhost:${PORTA_WEB},http://localhost:${PORTA_PWA},http://localhost:${PORTA_PWA_DEPLOY}`,
    // Playwright faz dezenas de logins em segundos; os limites reais são testados à parte (Security Gate).
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    API_RATE_LIMIT_PER_MINUTE: '5000',
    MODULOS_LEGADOS_ATIVOS: 'false',
  };
}

export function envWebE2E(): Record<string, string> {
  return { VITE_API_URL: `http://localhost:${PORTA_API}`, VITE_EMPRESA_ID: IDS.empresaA };
}
