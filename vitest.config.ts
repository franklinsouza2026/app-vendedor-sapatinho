import { configDefaults, defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Testes de integração (idempotência de ledger, RBAC, etc) precisam de um
// Postgres real — usamos um banco DEDICADO (.env.test →
// app_vendedor_sapatinho_test), nunca o banco de dev, pra não poluir dados
// reais com fixtures de teste. Parser simples, sem depender do pacote dotenv.
function lerVariavel(caminho: string, chave: string): string | undefined {
  if (!existsSync(caminho)) return undefined;
  const conteudo = readFileSync(caminho, 'utf-8');
  const match = conteudo.match(new RegExp(`^${chave}=(.*)$`, 'm'));
  return match?.[1];
}

// Só DATABASE_URL vem de arquivo local (.env.test tem prioridade sobre .env) —
// as demais variáveis ficam SEMPRE fixas nos valores de teste abaixo. Nunca
// herdar REDIS_URL/JWT_SECRET etc. do .env de dev: se o .env do desenvolvedor
// apontar pra infra real/compartilhada, os testes não podem acabar usando ela.
const databaseUrlTeste =
  lerVariavel(resolve(__dirname, '.env.test'), 'DATABASE_URL') ??
  lerVariavel(resolve(__dirname, '.env'), 'DATABASE_URL') ??
  'postgresql://user:pass@localhost:5432/db_teste';

export default defineConfig({
  test: {
    // Estende os defaults do vitest (não substitui — `exclude: [...]` sozinho
    // descartaria os padrões padrão de .git/cypress/*.config.*). Sem isso, o
    // vitest da raiz também tentaria rodar os testes do frontend (web/, que
    // precisa de jsdom + setup próprios) e os .test.js compilados em dist/.
    exclude: [...configDefaults.exclude, 'web/**', 'dist/**'],
    env: {
      NODE_ENV: 'development',
      APP_NAME: 'app-vendedor-sapatinho-test',
      JWT_SECRET: 'segredo-de-teste-com-pelo-menos-32-caracteres',
      JWT_ISSUER: 'app-vendedor-sapatinho',
      CPF_HASH_SECRET: 'outro-segredo-de-teste-com-pelo-menos-32-chars',
      DATABASE_URL: databaseUrlTeste,
      REDIS_URL: 'redis://localhost:6379',
      ERP_MODE: 'mock',
      // Testes de integração de identidade (Fatia 7.5A) chamam /auth/login e
      // /auth/ativacao repetidamente dentro da mesma janela de 1 minuto — bem
      // mais rápido que qualquer cadência humana real. Mesmo raciocínio já
      // aplicado ao .env local pra E2E (nunca o valor de produção, só aqui).
      LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    },
  },
});
