/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // Fase 1 (homologação visual): libera a demonstração mockada em build de
  // produção. Em `npm run dev` ela já fica disponível sem esta variável.
  readonly VITE_FASE1_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
