import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // testa contra um backend real compartilhado — evita corrida entre specs
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
