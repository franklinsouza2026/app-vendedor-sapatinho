-- Etapa 2B.4 — remoção do tipo de intervenção MENCIONOU.
--
-- Declarado na 2B.2, nunca produzido por nenhum código. A auditoria da 2B.3 não
-- encontrou uso legítimo que CELEBROU/SUGERIU não cobrissem, e a contagem em
-- dev e em teste antes desta migration foi ZERO em ambos.
--
-- PostgreSQL 16 não suporta `ALTER TYPE ... DROP VALUE` (nenhuma versão suporta
-- até hoje). O caminho seguro é recriar o tipo e reapontar a coluna:
--
--   1. renomeia o tipo antigo;
--   2. cria o novo, já sem o valor;
--   3. converte a coluna com cast explícito via texto;
--   4. remove o antigo.
--
-- O cast do passo 3 é a rede de segurança: se existisse UMA linha com
-- 'MENCIONOU', ele falharia com "invalid input value for enum" e a migration
-- inteira reverteria (Prisma roda cada migration numa transação). Nenhum dado
-- é reclassificado em silêncio.
--
-- Nenhum índice referencia `tipo` (os três são sobre dedupeKey/vendedorId/
-- status/ocorridoEm), então a conversão não reconstrói nem derruba constraint
-- alguma — em especial o índice único parcial que garante uma intervenção ativa
-- por assunto.

ALTER TYPE "TipoIntervencaoCoach" RENAME TO "TipoIntervencaoCoach_old";

CREATE TYPE "TipoIntervencaoCoach" AS ENUM ('CELEBROU', 'SUGERIU');

ALTER TABLE "coach_intervention"
  ALTER COLUMN "tipo" TYPE "TipoIntervencaoCoach"
  USING ("tipo"::text::"TipoIntervencaoCoach");

DROP TYPE "TipoIntervencaoCoach_old";
