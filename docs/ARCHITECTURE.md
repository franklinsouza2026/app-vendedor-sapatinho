# Arquitetura — App Vendedor Sapatinho de Luxo

Documento completo (briefing, diagrama, roadmap ICE, decisões) vive no vault Obsidian:
`~/Documents/Obsidian/03 - Projetos/Arquitetura-App-Vendedor-Sapatinho-de-Luxo/`

Resumo do que já está implementado (Fatia 0/1):

- `src/config.ts` — validação de env (fail fast)
- `src/db.ts` — client Prisma
- `prisma/schema.prisma` — `Empresa`, `Loja`, `Vendedor`, `Meta`, `IndicadorRealizado` (empresa_id/loja_id em toda tabela — ver Decisão 1 no vault)
- `src/middlewares/` — auth (JWT com `lojaId`+`papel`), rate-limit, error handler
- `src/routes/` — health, auth (login + cadastro de vendedor), metas
- `src/integracoes/erp/` — adapter com implementação mock (dev) e stub Linx (pendente de validação real)
- `src/queues/sync-erp.queue.ts` — job horário (BullMQ) que popula `indicador_realizado`, idempotente por hora
- `src/services/metas.service.ts` — calcula progresso dia/semana/mês a partir dos snapshots do ERP

Não implementado ainda (fatias futuras):
- Gamificação (moeda/ledger, regras configuráveis, ranking) — Fatia 2
- Coach motivacional e treinador de vendas via IA — Fatia 3
- Push notification — Fatia 4
- App React Native — próxima etapa combinada com o usuário
