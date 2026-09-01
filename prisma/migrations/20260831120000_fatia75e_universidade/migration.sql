-- CreateEnum
CREATE TYPE "TipoQuiz" AS ENUM ('REGULAR', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "StatusCompetencia" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TipoFonteEvidencia" AS ENUM ('QUIZ', 'SIMULATION', 'TRAINING_COMPLETION', 'MISSION', 'PERFORMANCE', 'MANAGER_ASSESSMENT', 'CERTIFICATION', 'RECERTIFICATION', 'DIAGNOSTIC_ASSESSMENT');

-- CreateEnum
CREATE TYPE "StatusPDI" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TipoItemPDI" AS ENUM ('LESSON', 'TRACK', 'QUIZ', 'SIMULATION', 'MISSION', 'PRACTICE', 'MANAGER_ACTION', 'REVIEW');

-- CreateEnum
CREATE TYPE "StatusItemPDI" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StatusRevisao" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TipoRequisitoCertificacao" AS ENUM ('TRACK', 'LESSON', 'QUIZ_MIN_SCORE', 'SIMULATION', 'COMPETENCY_TARGET', 'MANDAMENTOS_COMPLETOS');

-- CreateEnum
CREATE TYPE "StatusUserCertificacao" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED');

-- AlterTable
ALTER TABLE "academy_lesson" ADD COLUMN     "competencyIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "academy_question" ADD COLUMN     "competencyIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "academy_quiz" ADD COLUMN     "tipo" "TipoQuiz" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "academy_track" ADD COLUMN     "competencyIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "escolaId" TEXT,
ADD COLUMN     "onboarding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mission_definition" ADD COLUMN     "competencyIds" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "simulation_scenario" ADD COLUMN     "competencyIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "escola_universidade" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" "PublicoConteudo" NOT NULL DEFAULT 'BOTH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escola_universidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
    "category" TEXT,
    "status" "StatusCompetencia" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_target" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "targetScore" INTEGER NOT NULL DEFAULT 70,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_evidence" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "sourceType" "TipoFonteEvidencia" NOT NULL,
    "sourceId" TEXT,
    "normalizedScore" INTEGER NOT NULL,
    "weightProfileVersion" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_plan" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "baselineScore" INTEGER,
    "targetScore" INTEGER NOT NULL,
    "status" "StatusPDI" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_plan_item" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tipo" "TipoItemPDI" NOT NULL,
    "sourceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "StatusItemPDI" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_assessment" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "evidenceNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_schedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competencyId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'QUESTION',
    "sourceId" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "intervalStage" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusRevisao" NOT NULL DEFAULT 'PENDING',
    "lastResult" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_definition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
    "status" "StatusConteudo" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "validityMonths" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_requirement" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "tipo" "TipoRequisitoCertificacao" NOT NULL,
    "refId" TEXT,
    "minScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_certification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "StatusUserCertificacao" NOT NULL DEFAULT 'VALID',
    "evidenceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_certification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escola_universidade_code_key" ON "escola_universidade"("code");

-- CreateIndex
CREATE UNIQUE INDEX "competency_code_key" ON "competency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "competency_target_competencyId_papel_key" ON "competency_target"("competencyId", "papel");

-- CreateIndex
CREATE INDEX "competency_evidence_subjectUserId_competencyId_idx" ON "competency_evidence"("subjectUserId", "competencyId");

-- CreateIndex
CREATE INDEX "competency_evidence_competencyId_idx" ON "competency_evidence"("competencyId");

-- CreateIndex
CREATE INDEX "development_plan_subjectUserId_status_idx" ON "development_plan"("subjectUserId", "status");

-- CreateIndex
CREATE INDEX "development_plan_item_planId_idx" ON "development_plan_item"("planId");

-- CreateIndex
CREATE INDEX "manager_assessment_subjectUserId_competencyId_idx" ON "manager_assessment"("subjectUserId", "competencyId");

-- CreateIndex
CREATE INDEX "review_schedule_userId_status_nextReviewAt_idx" ON "review_schedule"("userId", "status", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_schedule_userId_sourceType_sourceId_key" ON "review_schedule"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "certification_definition_code_key" ON "certification_definition"("code");

-- CreateIndex
CREATE INDEX "certification_requirement_definitionId_idx" ON "certification_requirement"("definitionId");

-- CreateIndex
CREATE INDEX "user_certification_userId_idx" ON "user_certification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_certification_userId_definitionId_definitionVersion_key" ON "user_certification"("userId", "definitionId", "definitionVersion");

-- CreateIndex
CREATE INDEX "academy_track_escolaId_idx" ON "academy_track"("escolaId");

-- AddForeignKey
ALTER TABLE "competency_target" ADD CONSTRAINT "competency_target_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_evidence" ADD CONSTRAINT "competency_evidence_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plan" ADD CONSTRAINT "development_plan_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plan_item" ADD CONSTRAINT "development_plan_item_planId_fkey" FOREIGN KEY ("planId") REFERENCES "development_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_assessment" ADD CONSTRAINT "manager_assessment_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_requirement" ADD CONSTRAINT "certification_requirement_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "certification_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_certification" ADD CONSTRAINT "user_certification_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "certification_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

