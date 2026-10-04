/**
 * E2E da Fase 1 contra a stack ISOLADA (banco _e2e, Redis db 3, API :3020,
 * worker próprio, Vite :5183). Rodar pela raiz: `npm run e2e:fase1`, que
 * prepara o ambiente antes (scripts/e2e-fase1/preparar.ts).
 */
import { defineConfig, devices } from '@playwright/test';
import { envBackendE2E, envWebE2E, PORTA_API, PORTA_PWA, PORTA_WEB, RAIZ } from './e2e-fase1/ambiente';

export default defineConfig({
  testDir: './e2e-fase1',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'line',
  globalSetup: './e2e-fase1/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: RAIZ,
      env: envBackendE2E(),
      url: `http://localhost:${PORTA_API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${PORTA_WEB} --strictPort`,
      env: envWebE2E(),
      url: `http://localhost:${PORTA_WEB}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // build de produção (service worker + manifest reais) para a jornada E25
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORTA_PWA} --strictPort`,
      env: envWebE2E(),
      url: `http://localhost:${PORTA_PWA}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'mobile-390', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' }, testIgnore: /admin-desktop/ },
    { name: 'desktop-admin', use: { ...devices['Desktop Chrome'] }, testMatch: /admin-desktop/ },
  ],
});
