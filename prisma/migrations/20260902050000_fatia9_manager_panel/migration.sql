-- CreateEnum
CREATE TYPE "TipoAlertaGerencial" AS ENUM ('LOW_GOAL_ATTAINMENT', 'PA_BELOW_BASELINE', 'TICKET_BELOW_BASELINE', 'CONSISTENCY_DROP', 'NO_SALES_RECENTLY', 'MISSION_STALLED', 'TRAINING_OVERDUE', 'CERTIFICATION_EXPIRING', 'PDI_STALLED', 'COMPETENCY_GAP', 'NO_RECENT_MANAGER_FOLLOWUP');

-- CreateEnum
CREATE TYPE "SeveridadeAlertaGerencial" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "StatusAlertaGerencial" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TipoResolucaoAlerta" AS ENUM ('RESOLVED_OPERATIONALLY', 'METRIC_RECOVERED');

-- CreateEnum
CREATE TYPE "TipoSujeitoPlanoAcao" AS ENUM ('SELLER', 'TEAM', 'STORE');

-- CreateEnum
CREATE TYPE "StatusPlanoAcao" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TipoItemPlanoAcao" AS ENUM ('TALK', 'OBSERVE', 'TRAIN', 'ASSIGN_MISSION', 'ASSIGN_CONTENT', 'CREATE_PDI', 'REVIEW_PDI', 'RECOGNIZE', 'FOLLOW_UP', 'CUSTOM_TEXT');

-- CreateEnum
CREATE TYPE "StatusItemPlanoAcao" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StatusOneOnOne" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatusFollowUp" AS ENUM ('PENDING', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "manager_alert" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "sellerId" TEXT,
    "tipo" "TipoAlertaGerencial" NOT NULL,
    "severidade" "SeveridadeAlertaGerencial" NOT NULL,
    "status" "StatusAlertaGerencial" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "tipoResolucao" "TipoResolucaoAlerta",
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_action_plan" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "subjectType" "TipoSujeitoPlanoAcao" NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "StatusPlanoAcao" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "sourceAlertId" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_action_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_action_item" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tipo" "TipoItemPlanoAcao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusItemPlanoAcao" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_action_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_on_one" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "StatusOneOnOne" NOT NULL DEFAULT 'SCHEDULED',
    "pontosPositivos" TEXT,
    "pontosAtencao" TEXT,
    "compromissos" TEXT,
    "proximaRevisaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_on_one_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_followup" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "descricao" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "StatusFollowUp" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_followup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_alert_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoAlertaGerencial" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "parametros" JSONB NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_alert_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_alert_empresaId_lojaId_status_idx" ON "manager_alert"("empresaId", "lojaId", "status");

-- CreateIndex
CREATE INDEX "manager_alert_dedupeKey_idx" ON "manager_alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "manager_action_plan_empresaId_lojaId_status_idx" ON "manager_action_plan"("empresaId", "lojaId", "status");

-- CreateIndex
CREATE INDEX "manager_action_plan_subjectType_subjectId_idx" ON "manager_action_plan"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "manager_action_item_planId_idx" ON "manager_action_item"("planId");

-- CreateIndex
CREATE INDEX "one_on_one_empresaId_lojaId_sellerId_idx" ON "one_on_one"("empresaId", "lojaId", "sellerId");

-- CreateIndex
CREATE INDEX "one_on_one_empresaId_lojaId_managerId_idx" ON "one_on_one"("empresaId", "lojaId", "managerId");

-- CreateIndex
CREATE INDEX "manager_followup_empresaId_lojaId_managerId_status_idx" ON "manager_followup"("empresaId", "lojaId", "managerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "manager_alert_config_empresaId_tipo_key" ON "manager_alert_config"("empresaId", "tipo");

-- AddForeignKey
ALTER TABLE "manager_action_item" ADD CONSTRAINT "manager_action_item_planId_fkey" FOREIGN KEY ("planId") REFERENCES "manager_action_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dedupe de alertas (seção 12/70): no máximo 1 alerta OPEN ou ACKNOWLEDGED
-- por (empresaId, lojaId, sellerId, tipo) — índice único PARCIAL (Prisma não
-- expressa isso no schema.prisma). Alertas RESOLVED/DISMISSED nunca colidem,
-- preservando histórico completo (nunca hard-delete).
CREATE UNIQUE INDEX "manager_alert_dedupe_open_uidx" ON "manager_alert"("dedupeKey") WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');
