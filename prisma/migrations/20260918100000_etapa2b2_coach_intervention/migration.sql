-- CreateEnum
CREATE TYPE "TipoIntervencaoCoach" AS ENUM ('MENCIONOU', 'CELEBROU', 'SUGERIU');

-- CreateEnum
CREATE TYPE "StatusIntervencaoCoach" AS ENUM ('REGISTRADA', 'ACEITA', 'RECUSADA', 'ADIADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "coach_intervention" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "tipo" "TipoIntervencaoCoach" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "StatusIntervencaoCoach" NOT NULL DEFAULT 'REGISTRADA',
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "coach_intervention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_intervention_vendedorId_status_ocorridoEm_idx" ON "coach_intervention"("vendedorId", "status", "ocorridoEm");

-- CreateIndex
CREATE INDEX "coach_intervention_dedupeKey_idx" ON "coach_intervention"("dedupeKey");


-- Índice único PARCIAL (não expressável em @@unique do Prisma — mesmo padrão
-- de coach_conversation, simulation_session, development_plan e manager_alert).
--
-- Garante, no BANCO, que só existe UMA intervenção ATIVA por assunto: duas
-- requisições concorrentes não criam duas sugestões iguais pendentes. Depender
-- de SELECT-depois-INSERT não fecha essa janela.
--
-- Estados terminais (RECUSADA, CONCLUIDA) ficam FORA do índice de propósito:
-- recusa é contextual àquela sugestão, nunca preferência permanente, então o
-- mesmo assunto pode voltar mais tarde. Quem impede a repetição imediata é o
-- cooldown na LEITURA, não a constraint.
CREATE UNIQUE INDEX "coach_intervention_dedupe_ativa_uidx" ON "coach_intervention"("dedupeKey")
  WHERE "status" IN ('REGISTRADA', 'ACEITA', 'ADIADA');
