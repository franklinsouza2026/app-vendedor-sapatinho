-- CreateEnum
CREATE TYPE "MoodCheckIn" AS ENUM ('VERY_GOOD', 'GOOD', 'NEUTRAL', 'NOT_GOOD');

-- CreateEnum
CREATE TYPE "StatusConversaCoach" AS ENUM ('ABERTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "RoleMensagemCoach" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "StatusUsoIA" AS ENUM ('SUCESSO', 'ERRO', 'TIMEOUT', 'BLOQUEADO_BUDGET', 'BLOQUEADO_RATE_LIMIT');

-- CreateTable
CREATE TABLE "coach_checkin" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "mood" "MoodCheckIn" NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_conversation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusConversaCoach" NOT NULL DEFAULT 'ABERTA',
    "geracaoEmAndamento" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "coach_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "RoleMensagemCoach" NOT NULL,
    "content" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUSD" DECIMAL(10,6),
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_professional_memory" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "developmentAreas" JSONB NOT NULL DEFAULT '[]',
    "currentFocus" TEXT,
    "summary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_professional_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUSD" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusUsoIA" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_budget_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "monthlyLimitUSD" DECIMAL(10,2) NOT NULL,
    "dailyMessageLimitPerSeller" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "ai_budget_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_checkin_vendedorId_dia_key" ON "coach_checkin"("vendedorId", "dia");

-- CreateIndex
CREATE INDEX "coach_conversation_empresaId_lojaId_vendedorId_idx" ON "coach_conversation"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE INDEX "coach_message_conversationId_createdAt_idx" ON "coach_message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coach_message_conversationId_clientMessageId_key" ON "coach_message"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_professional_memory_vendedorId_key" ON "coach_professional_memory"("vendedorId");

-- CreateIndex
CREATE INDEX "ai_usage_empresaId_createdAt_idx" ON "ai_usage"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_vendedorId_createdAt_idx" ON "ai_usage"("vendedorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_budget_config_empresaId_key" ON "ai_budget_config"("empresaId");

-- AddForeignKey
ALTER TABLE "coach_checkin" ADD CONSTRAINT "coach_checkin_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_conversation" ADD CONSTRAINT "coach_conversation_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_message" ADD CONSTRAINT "coach_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "coach_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_professional_memory" ADD CONSTRAINT "coach_professional_memory_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_budget_config" ADD CONSTRAINT "ai_budget_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
