-- CreateEnum
CREATE TYPE "CategoriaMissao" AS ENUM ('PERFORMANCE', 'LEARNING', 'SIMULATION', 'CONSISTENCY');

-- CreateEnum
CREATE TYPE "CriterioMissao" AS ENUM ('DAILY_GOAL', 'PA_IMPROVEMENT', 'TICKET_IMPROVEMENT', 'COMPLETE_LESSON', 'PASS_QUIZ', 'COMPLETE_SIMULATION', 'STREAK_3');

-- CreateEnum
CREATE TYPE "PeriodoMissao" AS ENUM ('DIA', 'SEMANA');

-- CreateEnum
CREATE TYPE "StatusMissao" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TipoAcaoMissao" AS ENUM ('COACH', 'TRAINER', 'SIMULATOR', 'ACADEMY', 'PERFORMANCE');

-- CreateTable
CREATE TABLE "mission_definition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CategoriaMissao" NOT NULL,
    "criterionType" "CriterioMissao" NOT NULL,
    "criterionConfig" JSONB NOT NULL DEFAULT '{}',
    "periodType" "PeriodoMissao" NOT NULL DEFAULT 'DIA',
    "actionType" "TipoAcaoMissao" NOT NULL,
    "actionReference" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_assignment" (
    "id" TEXT NOT NULL,
    "missionDefinitionId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusMissao" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "progressoAtual" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "progressoAlvo" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mission_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_definition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criterionType" TEXT NOT NULL,
    "criterionConfig" JSONB NOT NULL DEFAULT '{}',
    "periodType" "PeriodoMissao" NOT NULL DEFAULT 'SEMANA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_assignment" (
    "id" TEXT NOT NULL,
    "challengeDefinitionId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusMissao" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "progressoAtual" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "progressoAlvo" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mission_definition_code_key" ON "mission_definition"("code");

-- CreateIndex
CREATE INDEX "mission_assignment_vendedorId_status_idx" ON "mission_assignment"("vendedorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mission_assignment_vendedorId_missionDefinitionId_startsAt_key" ON "mission_assignment"("vendedorId", "missionDefinitionId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_definition_code_key" ON "challenge_definition"("code");

-- CreateIndex
CREATE INDEX "challenge_assignment_vendedorId_status_idx" ON "challenge_assignment"("vendedorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_assignment_vendedorId_challengeDefinitionId_start_key" ON "challenge_assignment"("vendedorId", "challengeDefinitionId", "startsAt");

-- AddForeignKey
ALTER TABLE "mission_assignment" ADD CONSTRAINT "mission_assignment_missionDefinitionId_fkey" FOREIGN KEY ("missionDefinitionId") REFERENCES "mission_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_assignment" ADD CONSTRAINT "mission_assignment_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_assignment" ADD CONSTRAINT "challenge_assignment_challengeDefinitionId_fkey" FOREIGN KEY ("challengeDefinitionId") REFERENCES "challenge_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_assignment" ADD CONSTRAINT "challenge_assignment_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
