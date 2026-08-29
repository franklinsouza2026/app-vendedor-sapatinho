import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker só ativo em build de produção — evita servir cache
      // obsoleto durante desenvolvimento.
      devOptions: { enabled: false },
      manifest: {
        name: 'Vendedor IA — Sapatinho de Luxo',
        short_name: 'Vendedor IA',
        description: 'Suas metas, seu ranking e sua evolução, todo dia.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só precache dos assets estáticos do build (JS/CSS/HTML/ícones).
        // NUNCA cachear respostas de API autenticadas — sem runtimeCaching
        // aqui, toda chamada a /auth, /metas, /gamificacao vai direto pra
        // rede, nunca serve dado em cache de outro usuário após logout.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
