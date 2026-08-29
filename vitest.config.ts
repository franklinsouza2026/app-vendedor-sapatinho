import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'development',
      APP_NAME: 'app-vendedor-sapatinho-test',
      JWT_SECRET: 'segredo-de-teste-com-pelo-menos-32-caracteres',
      JWT_ISSUER: 'app-vendedor-sapatinho',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db_teste',
      REDIS_URL: 'redis://localhost:6379',
      ERP_MODE: 'mock',
    },
  },
});
