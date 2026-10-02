// A demo da Fase 1 (src/fase1) só entra no CSS quando ela existe no bundle —
// mesma condição do App.tsx. Sem isso, o build de produção carregaria ~14 kB
// de classes de uma tela que nem é registrada.
const fase1Demo = process.env.NODE_ENV !== 'production' || process.env.VITE_FASE1_DEMO === 'true';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', ...(fase1Demo ? [] : ['!./src/fase1/**'])],
  theme: {
    extend: {
      colors: {
        base: '#0f172a',
        surface: '#1e293b',
        // Superfície secundária — pra card-dentro-de-card (ex. linha de extrato
        // dentro de um Card) ter contraste visível em vez de ficar plana contra
        // `surface` (achado da auditoria: "card dentro de card" sem hierarquia).
        surfaceRaised: '#28374c',
        accent: '#d97706',
        accentSoft: '#fbbf24',
        // Cor de identidade de cada módulo de "Evoluir" — mesma paleta base
        // (slate/accent) continua sendo o tom do produto; estas só marcam
        // qual especialista é qual, de relance, sem virar arco-íris.
        coach: '#0ea5e9',
        treinador: '#10b981',
        simulador: '#a855f7',
        academia: '#f59e0b',
      },
    },
  },
  plugins: [],
};
