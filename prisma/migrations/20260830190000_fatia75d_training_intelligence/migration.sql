-- CreateEnum
CREATE TYPE "TipoJobTreinamento" AS ENUM ('PACOTE_TREINAMENTO', 'ATUALIZACAO_CONTEUDO');

-- CreateEnum
CREATE TYPE "StatusJobTreinamento" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConfiabilidadeFonte" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "StatusGovernanca" AS ENUM ('PASS', 'REVIEW_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TipoAchadoGovernanca" AS ENUM ('OFFICIAL_CONFLICT', 'UNSUPPORTED_CLAIM', 'COPYRIGHT_RISK', 'BRAND_TONE', 'INAPPROPRIATE_ADVICE', 'MISSING_SOURCE', 'LOW_RELIABILITY_SOURCE', 'MANDAMENTO_VIOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "StatusRevisaoConteudo" AS ENUM ('UP_TO_DATE', 'REVIEW_RECOMMENDED', 'UPDATE_DRAFT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EspecialistaIA" ADD VALUE 'ADMIN_AI_TEST';
ALTER TYPE "EspecialistaIA" ADD VALUE 'RESEARCH_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'CURATOR_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'INSTRUCTIONAL_DESIGNER';
ALTER TYPE "EspecialistaIA" ADD VALUE 'QUIZ_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'SIMULATION_DESIGNER';
ALTER TYPE "EspecialistaIA" ADD VALUE 'GOVERNANCE_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'CONTENT_UPDATE_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'SELLER_TRAINING_AGENT';
ALTER TYPE "EspecialistaIA" ADD VALUE 'MANAGER_TRAINING_AGENT';

-- AlterTable
ALTER TABLE "academy_lesson" ADD COLUMN     "trainingJobId" TEXT;

-- AlterTable
ALTER TABLE "academy_question" ADD COLUMN     "origemEditorial" "OrigemEditorial" NOT NULL DEFAULT 'ADMIN_CURATED',
ADD COLUMN     "trainingJobId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "training_intelligence_job" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "type" "TipoJobTreinamento" NOT NULL DEFAULT 'PACOTE_TREINAMENTO',
    "topic" TEXT NOT NULL,
    "objective" TEXT,
    "targetAudience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
    "status" "StatusJobTreinamento" NOT NULL DEFAULT 'QUEUED',
    "currentStep" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "governanceStatus" "StatusGovernanca",
    "reviewOutcome" TEXT,
    "reviewNotes" TEXT,
    "targetLessonId" TEXT,
    "updateRecommendation" "StatusRevisaoConteudo",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_intelligence_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_source" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WEB',
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "reliability" "ConfiabilidadeFonte" NOT NULL DEFAULT 'UNKNOWN',
    "rightsNotes" TEXT,
    "excludedByAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "training_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_governance_finding" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "TipoAchadoGovernanca" NOT NULL,
    "severity" "StatusGovernanca" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_governance_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_scenario_draft" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "customerProfile" TEXT NOT NULL,
    "sellerObjective" TEXT NOT NULL,
    "objections" JSONB NOT NULL DEFAULT '[]',
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "competencies" JSONB NOT NULL DEFAULT '[]',
    "evaluationCriteria" JSONB NOT NULL DEFAULT '[]',
    "status" "StatusConteudo" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "publishedScenarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_scenario_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_intelligence_job_empresaId_status_idx" ON "training_intelligence_job"("empresaId", "status");

-- CreateIndex
CREATE INDEX "training_intelligence_job_empresaId_createdAt_idx" ON "training_intelligence_job"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "training_intelligence_job_empresaId_requestedBy_createdAt_idx" ON "training_intelligence_job"("empresaId", "requestedBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "training_intelligence_job_empresaId_idempotencyKey_key" ON "training_intelligence_job"("empresaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "training_source_jobId_idx" ON "training_source"("jobId");

-- CreateIndex
CREATE INDEX "training_governance_finding_jobId_idx" ON "training_governance_finding"("jobId");

-- CreateIndex
CREATE INDEX "training_scenario_draft_empresaId_status_idx" ON "training_scenario_draft"("empresaId", "status");

-- CreateIndex
CREATE INDEX "academy_lesson_trainingJobId_idx" ON "academy_lesson"("trainingJobId");

-- CreateIndex
CREATE INDEX "academy_question_trainingJobId_idx" ON "academy_question"("trainingJobId");

-- AddForeignKey
ALTER TABLE "training_source" ADD CONSTRAINT "training_source_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "training_intelligence_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_governance_finding" ADD CONSTRAINT "training_governance_finding_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "training_intelligence_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_scenario_draft" ADD CONSTRAINT "training_scenario_draft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "training_intelligence_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

