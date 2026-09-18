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
  // Fatia 9.7: o Playwright passa a subir o próprio dev server. Antes o Vite
  // precisava estar rodando por fora, o que impedia o E2E de rodar no CI.
  // Localmente, reusa o servidor que já estiver de pé (não mata o seu `npm run dev`).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }, // testa no viewport mobile de verdade, não desktop
    },
  ],
});
