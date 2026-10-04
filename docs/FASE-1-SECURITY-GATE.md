# Fase 1 — Security Gate (Onda 9)

Data: 2026-10-04. Ambiente: local, sem nenhum ataque a sistema de terceiros.
A skill `security-audit` está desabilitada nas configurações desta máquina
(`skillOverrides`), por isso a revisão foi manual, com testes automatizados.

## Resultado

| Item | Situação | Evidência |
|---|---|---|
| Segredos versionados (árvore + histórico) | 🟢 nenhum segredo real | `gitleaks git --redact`: 4 achados, todos valores fictícios de CI/teste (`ci.yml`, `vitest.config.ts`, teste de tela). `.env` nunca versionado; `.env.test` só aponta para o banco local de teste. |
| Dependências do backend em produção | 🟢 0 vulnerabilidades | `npm audit --omit=dev` após `npm audit fix` (express/body-parser/qs, sem quebra). |
| Dependências do bundle web | 🟡 1 moderada, não explorável | react-router 6 (open redirect por `\` em `<Link>`/`navigate`). O app nunca navega para destino vindo da URL. Correção exige v7 (major). |
| Ferramentas de dev/build do web | 🟡 aceito com registro | vite 5, vitest 2, tailwind 3: altas/crítica afetam servidor de dev/Vitest UI (não usado), nunca o build servido em produção. Correção exige upgrades maiores. |
| §22 Zero trust (20 tentativas) | 🟢 todas falham de forma segura | `src/fase1/zero-trust.integration.test.ts` (30 casos) + E20/E21/E22/E23 no E2E. |
| Papel/escopo no token | 🟢 | empresa, loja, papel, status e versão de sessão revalidados no banco a cada requisição; token sem a chave, com `alg: none` ou com papel trocado → 401. |
| Bloqueio por conta (força bruta) | 🟢 **corrigido** | ver achado S-1. Teste: `src/identidade/bloqueio-login.integration.test.ts`. |
| Referências entre empresas | 🟢 **endurecido** | ver achado S-2. |
| Segredo de integração (T2) | 🟢 | AES-256-GCM, chave fora do banco, sufixo mascarado; nunca em GET, banco em claro, auditoria ou log (teste §23). |
| Logs | 🟢 | redact de `Authorization`, senha, CPF, token de ativação e credenciais. |
| Headers / CSP / CORS | 🟢 | `helmet()` na API; nginx com CSP sem `unsafe-eval`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`; CORS por allowlist, obrigatório em produção. |
| Rate limit | 🟢 | por IP (API e login) + bloqueio por conta no Redis. `trust proxy` numérico. |
| `/health/deep` | 🟢 | sem autenticação, mas só devolve booleanos (banco/Redis). |
| Source maps / fixtures no bundle | 🟢 | build sem `.map`; provedor de demonstração e cenários fora do bundle. |
| Rotas fora da Fase 1 | 🟢 | não montadas sem `MODULOS_LEGADOS_ATIVOS` → 404 (deny by default). |

## Achados corrigidos nesta onda

**S-1 — tentativas de login erradas não eram contadas durante a conexão com o Redis.**
O cliente do bloqueio usava `enableOfflineQueue: false`; todo comando emitido
enquanto a conexão subia (partida da API, reconexão) falhava e o erro era
engolido. Na prática, as primeiras tentativas após um restart não contavam.
Correção: fila ligada com `connectTimeout`/`commandTimeout` de 2 s (Redis
realmente fora continua no caminho documentado: o rate limit por IP segue
valendo). Achado por teste novo, que falhava antes da correção.

**S-2 — rascunho de campanha aceitava ID de competição/prêmio/loja de outra empresa.**
Não havia vazamento (publicar exige validação por empresa e o resultado só
existe depois de publicada), mas a regra de zero trust é não guardar
referência alheia. Correção: o salvamento recusa (400).

## Riscos aceitos e pendências (decisão do produto)

1. **Upgrade de ferramentas do frontend** (vite 5→8, vitest 2→4, tailwind 3→4,
   react-router 6→7): grande e com quebra; nenhuma das vulnerabilidades atinge
   o que vai para produção. Recomendação: fazer numa fatia própria antes do
   piloto amplo.
2. CSP do nginx ainda libera `frame-src` YouTube/Vimeo (Academia, fora da
   Fase 1). Inofensivo; pode ser fechado quando a Academia for desligada de vez.
3. Rate limit por IP fica em memória por processo: correto para 1 réplica da
   API (piloto). Com mais réplicas, mover para Redis.
