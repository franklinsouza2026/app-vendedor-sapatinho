-- Achado de security review (Fatia 4): sem essa restrição, chamadas
-- concorrentes a getOrCreateConversaAtual/criarNovaConversa podiam criar mais
-- de 1 conversa ABERTA para o mesmo vendedor (findFirst+create/updateMany+create
-- não são atômicos). Com múltiplas conversas abertas simultâneas, cada uma tem
-- seu próprio lock de geração (geracaoEmAndamento) — um vendedor podia disparar
-- N mensagens em paralelo (uma por conversa), cada uma lendo o mesmo contador
-- de rate limit/budget ainda não commitado, e todas passarem, furando o limite
-- diário por vendedor e o budget mensal da empresa.
--
-- Índice único parcial: no máximo 1 linha com status='ABERTA' por vendedorId.
-- Não é expressável em @@unique no schema.prisma (Prisma não suporta índice
-- único parcial nativamente), por isso é uma migração raw SQL.
CREATE UNIQUE INDEX "coach_conversation_vendedor_aberta_uidx"
  ON "coach_conversation" ("vendedorId")
  WHERE "status" = 'ABERTA';
