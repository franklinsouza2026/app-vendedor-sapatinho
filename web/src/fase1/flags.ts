/**
 * Gate da demonstração da Fase 1 — Performance & Game.
 *
 * A árvore `/fase1/*` é um PROTÓTIPO DE HOMOLOGAÇÃO com dados simulados. Ela
 * só existe em `npm run dev` ou quando o build recebe `VITE_FASE1_DEMO=true`;
 * num build de produção comum as rotas nem são registradas e o chunk lazy
 * nunca é baixado. Nada aqui toca auth, API ou banco.
 */
export const FASE1_DEMO_HABILITADA: boolean = import.meta.env.DEV || import.meta.env.VITE_FASE1_DEMO === 'true';
