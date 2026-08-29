# App Vendedor Sapatinho de Luxo — Web (PWA)

PWA mobile-first do vendedor: meta do dia, ranking, moedas, XP/nível, streak e conquistas. Consome a API em `../src`.

**Stack:** Vite + React + TypeScript + Tailwind + `vite-plugin-pwa`.

## Setup local

```bash
npm install
cp .env.example .env   # VITE_API_URL aponta pro backend (padrão: http://localhost:3000)

npm run dev             # http://localhost:5173 — backend precisa estar rodando também
```

## Scripts

```bash
npm run lint       # typecheck
npm run build      # build de produção (gera manifest + service worker)
npm run preview    # serve o build de produção localmente (só assim o PWA fica ativo — dev tem devOptions.enabled=false)
npm test           # unit/component (vitest + testing-library)
npm run test:e2e   # E2E real (playwright) — precisa do backend E do `npm run dev` já rodando em outro terminal
```

## Decisões importantes

- **Token em `localStorage`**: única opção compatível com a autenticação Bearer stateless do backend (sem cookie de sessão). Ver Decisão 11 em `05-Decisoes-e-Tradeoffs.md` do vault.
- **Service Worker nunca cacheia API**: só precache de assets estáticos do build (JS/CSS/HTML/ícones). Logout limpa `localStorage` + `Cache Storage` inteiro — testado manualmente com o SW real ativo (login → moedas → logout → tentar `/moedas` direto → redireciona pro login sem vazar dado).
- **Ícones do manifest são placeholder** (`public/icons/`) — gerados programaticamente, substituir por design real quando houver.
- **"Meta inteligente" e "ritmo necessário"** (`src/utils/calculo.ts`) são cálculos determinísticos de exibição feitos no cliente a partir de dados já retornados pela API (divisão simples) — não são regra de negócio versionada como XP/moeda/score, que vivem só no backend.
