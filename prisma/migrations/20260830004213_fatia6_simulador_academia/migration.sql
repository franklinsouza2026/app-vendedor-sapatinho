-- CreateEnum
CREATE TYPE "DificuldadeSimulacao" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "StatusSimulacao" AS ENUM ('CREATED', 'ACTIVE', 'COMPLETED', 'EVALUATION_PENDING', 'EVALUATED', 'FAILED');

-- CreateEnum
CREATE TYPE "RoleMensagemSimulacao" AS ENUM ('VENDEDOR', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatusProgressoAcademia" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterEnum
ALTER TYPE "EspecialistaIA" ADD VALUE 'SIMULATOR';

-- CreateTable
CREATE TABLE "simulation_scenario" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" "DificuldadeSimulacao" NOT NULL,
    "objective" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "playbookCategorias" JSONB NOT NULL DEFAULT '[]',
    "personasPorDificuldade" JSONB NOT NULL,
    "maxTurnsPorDificuldade" JSONB NOT NULL DEFAULT '{"EASY":8,"MEDIUM":11,"HARD":15}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_session" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "difficulty" "DificuldadeSimulacao" NOT NULL,
    "personaSnapshot" JSONB NOT NULL,
    "maxTurns" INTEGER NOT NULL,
    "status" "StatusSimulacao" NOT NULL DEFAULT 'CREATED',
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "reasonEnded" TEXT,
    "geracaoEmAndamento" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "RoleMensagemSimulacao" NOT NULL,
    "content" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUSD" DECIMAL(10,6),
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_evaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criteriosAvaliados" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "scoreFinal" INTEGER NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "improvements" JSONB NOT NULL DEFAULT '[]',
    "missedOpportunities" JSONB NOT NULL DEFAULT '[]',
    "betterExample" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUSD" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_track" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_lesson" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "origem" "OrigemConteudoPlaybook" NOT NULL DEFAULT 'DEMONSTRATIVO',
    "estimatedMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "playbookCategoria" "CategoriaPlaybook",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_quiz" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "academy_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_progress" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" "StatusProgressoAcademia" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "quizScore" INTEGER,
    "quizPassed" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulation_scenario_code_key" ON "simulation_scenario"("code");

-- CreateIndex
CREATE INDEX "simulation_session_empresaId_lojaId_vendedorId_idx" ON "simulation_session"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE INDEX "simulation_session_vendedorId_status_idx" ON "simulation_session"("vendedorId", "status");

-- CreateIndex
CREATE INDEX "simulation_message_sessionId_createdAt_idx" ON "simulation_message"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_message_sessionId_clientMessageId_key" ON "simulation_message"("sessionId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_evaluation_sessionId_versao_key" ON "simulation_evaluation"("sessionId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "academy_track_code_key" ON "academy_track"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academy_lesson_code_key" ON "academy_lesson"("code");

-- CreateIndex
CREATE INDEX "academy_lesson_trackId_sortOrder_idx" ON "academy_lesson"("trackId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "academy_quiz_lessonId_key" ON "academy_quiz"("lessonId");

-- CreateIndex
CREATE INDEX "academy_question_quizId_sortOrder_idx" ON "academy_question"("quizId", "sortOrder");

-- CreateIndex
CREATE INDEX "academy_option_questionId_sortOrder_idx" ON "academy_option"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "academy_progress_vendedorId_lessonId_key" ON "academy_progress"("vendedorId", "lessonId");

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "simulation_session_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_session" ADD CONSTRAINT "simulation_session_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "simulation_scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_message" ADD CONSTRAINT "simulation_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "simulation_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_evaluation" ADD CONSTRAINT "simulation_evaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "simulation_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_lesson" ADD CONSTRAINT "academy_lesson_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "academy_track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_quiz" ADD CONSTRAINT "academy_quiz_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_question" ADD CONSTRAINT "academy_question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "academy_quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_option" ADD CONSTRAINT "academy_option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "academy_question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_progress" ADD CONSTRAINT "academy_progress_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_progress" ADD CONSTRAINT "academy_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lição das Fatias 4/5 (security review): sem essa restrição, chamadas
-- concorrentes de criação de sessão de simulação podiam abrir 2+ sessões
-- CREATED/ACTIVE pro mesmo vendedor, cada uma com seu próprio lock de
-- geração, furando rate limit/budget via mensagens em paralelo em sessões
-- diferentes.
CREATE UNIQUE INDEX "simulation_session_vendedor_ativa_uidx"
  ON "simulation_session" ("vendedorId")
  WHERE "status" IN ('CREATED', 'ACTIVE');
