-- Achado da auditoria seção 79 (concorrência): nada garantia "1 PDI ativo por
-- competência" no banco, apesar de `pdi.service.ts` já presumir isso em
-- comentário (`concluirItemPDIPorConteudo`). 2 criações concorrentes da
-- mesma competência pro mesmo usuário podiam gerar 2 planos ACTIVE
-- simultâneos, confuso na tela "Meu Plano". Índice único PARCIAL (só sobre
-- status='ACTIVE') — mesmo padrão já usado no Coach (Fatia 4, 1 conversa
-- ABERTA por vendedor) — não pode ser expresso como `@@unique` do Prisma,
-- por isso SQL raw.
CREATE UNIQUE INDEX "development_plan_ativo_unico_idx" ON "development_plan" ("subjectUserId", "competencyId") WHERE "status" = 'ACTIVE';
