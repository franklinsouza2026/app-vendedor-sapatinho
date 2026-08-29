# Arquitetura — App Vendedor Sapatinho de Luxo

Documento completo (briefing, diagrama, roadmap ICE, decisões) vive no vault Obsidian:
`~/Documents/Obsidian/03 - Projetos/Arquitetura-App-Vendedor-Sapatinho-de-Luxo/`

A partir da Fatia 2, a especificação funcional detalhada do produto (gamificação, coach, treinador, etc.) é `FONTE_DE_VERDADE_VENDEDOR_IA.md` — ler antes de mudar regra de negócio.

## Fatia 0/1 — Fundação + MVP de metas

- `src/config.ts` — validação de env (fail fast)
- `src/db.ts` — client Prisma
- `prisma/schema.prisma` — `Empresa`, `Loja`, `Vendedor`, `Meta`, `IndicadorRealizado` (empresa_id/loja_id em toda tabela — ver Decisão 1 no vault)
- `src/middlewares/` — auth (JWT com `lojaId`+`papel`), rate-limit, error handler
- `src/routes/` — health, auth (login + cadastro de vendedor), metas
- `src/integracoes/erp/` — adapter com implementação mock (dev) e stub Linx (pendente de validação real)
- `src/queues/sync-erp.queue.ts` — job horário (BullMQ) que popula `indicador_realizado`, idempotente por hora
- `src/services/metas.service.ts` — calcula progresso dia/semana/mês a partir dos snapshots do ERP

## Fatia 2 — Gamification Engine determinístico

Tudo em `src/gamificacao/`, sem nenhuma dependência de LLM (motor calcula, IA só vai interpretar nas fatias futuras):

- `regras.service.ts` — Control Plane versionado (`RegraGamificacaoVersao`); régua v1 (`REGUA_V1`) vem de `FONTE_DE_VERDADE_VENDEDOR_IA.md`, seções 13/14/18
- `ledger.service.ts` — ledger imutável de XP e VendaCoins, idempotente (`idempotencyKey` único), com reversão compensatória (`reverterMoeda`) — nunca edita/apaga transação histórica
- `motor.service.ts` — avalia a meta diária a cada sync do ERP (tiers 100/110/120/150%), concede e **reverte** quando um resync do ERP derruba o faturamento abaixo do tier; rastreia por saldo líquido de uma referência estável, permitindo reconceder se a venda voltar a valer no mesmo dia (ver Decisão 6 no vault)
- `baseline.service.ts` — baseline pessoal (PA, ticket, faturamento) com janela de 14 dias fechados e amostra mínima de 5 — nunca inclui o dia avaliado, nunca inventa média com poucos dados
- `streak.service.ts` — fecha um dia por vez (nunca o dia corrente — ver Decisão 8), idempotente via `StreakChecagem`
- `badges.service.ts` — catálogo v1 restrito (`PRIMEIRA_META`, `STREAK_7`, `PA_MASTER`, `TICKET_MASTER` — ver Decisão 9)
- `score.ts` — funções puras de normalização e Score Geral (testadas sem banco)
- `ranking.service.ts` — 7 rankings paralelos por snapshot (loja + rede), incluindo `EVOLUCAO` isolado do `SCORE_GERAL` (ver Decisão 10)
- `niveis.ts` — curva de XP→nível v1 (Bronze..Elite)

Filas novas: `src/queues/fechamento-dia.queue.ts` (job diário às 00:10, isola falha por vendedor). `sync-erp.queue.ts` agora dispara `avaliarMetaDiaria` por vendedor e recalcula os rankings do dia ao final do ciclo.

Rotas novas: `src/routes/gamificacao.ts` (`/gamificacao/carteira`, `/extrato-moedas`, `/streak`, `/badges`, `/ranking`) — sempre resolvem `vendedorId`/`empresaId`/`lojaId` a partir do JWT, nunca de parâmetro do client (elimina IDOR estruturalmente).

## Fatia 3 — PWA mobile-first do vendedor

Frontend novo em `web/` (Vite + React + TS + Tailwind + `vite-plugin-pwa`) — ver `web/README.md`. Consome os endpoints das Fatias 0-2 sem duplicar regra de negócio no cliente.

Endpoints novos no backend, pequenos e testados (não expandiram o core):
- `GET /lojas` — público (roda antes do login), lista lojas pro formulário de login mobile por nome amigável em vez do código ERP técnico. Filtra pela empresa mais antiga do deployment — nunca lista lojas de outra empresa (ver Decisão 12 no vault; achado de security review antes do commit)
- `GET /auth/me` — autenticado, reidrata vendedor/loja/empresa a partir do JWT (usado no F5/reabertura do PWA). Verifica `vendedor.ativo` e nunca usa `findUniqueOrThrow` em rota HTTP direta (ver Decisão 13)

## Testes

- `*.test.ts` — unitários puros (score, níveis, JWT, cálculos de exibição do frontend), sem banco
- `*.integration.test.ts` — contra Postgres real, banco **dedicado** de teste (`.env.test` → `app_vendedor_sapatinho_test`, nunca o banco de dev — ver incidente documentado nas decisões)
- Casos cobertos: idempotência de reprocessamento, reversão por resync, reconcessão após reversão no mesmo dia, streak consecutivo/reset, baseline com amostra insuficiente, RBAC e isolamento de tenant nas rotas, tenant isolation de `/lojas`, sessão expirada/vendedor desativado não derruba o processo
- Frontend: testes de componente (login, proteção de rota, home) + E2E real (Playwright) cobrindo login → home → ranking → moedas → conquistas → logout, incluindo confirmação de que nenhuma rota protegida vaza dado após logout

## Não implementado ainda (fatias futuras)

- Coach IA (Fatia 4), Treinador IA (Fatia 5), Simulador + Academia (Fatia 6), Missões/Desafios (Fatia 7), Competições/Temporadas/Feed (Fatia 8), Painel do Gestor avançado (Fatia 9), Linx real (Fatia 10)
- Seleção de múltiplas lojas por vendedor (modelo de dados atual não suporta — `Vendedor.lojaId` é singular)
