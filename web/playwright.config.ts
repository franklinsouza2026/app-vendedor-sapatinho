import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // testa contra um backend real compartilhado — evita corrida entre specs
  // fullyParallel:false só serializa os testes DENTRO de um arquivo — arquivos
  // diferentes ainda rodam em workers paralelos por padrão. Como vários specs
  // fazem login/logout repetidos contra o MESMO backend (rate limit real de
  // 10 logins/min/IP), rodar em paralelo gerava falsos negativos por 429.
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }, // testa no viewport mobile de verdade, não desktop
    },
  ],
});
