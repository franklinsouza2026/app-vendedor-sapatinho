-- CreateEnum
CREATE TYPE "EspecialistaIA" AS ENUM ('COACH', 'TRAINER');

-- CreateEnum
CREATE TYPE "StatusPlaybook" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CategoriaPlaybook" AS ENUM ('PRINCIPIOS', 'ABORDAGEM', 'SONDAGEM', 'DEMONSTRACAO', 'ARGUMENTACAO', 'OBJECOES', 'FECHAMENTO', 'VENDA_COMPLEMENTAR', 'POS_VENDA', 'CONDUTA');

-- CreateEnum
CREATE TYPE "OrigemConteudoPlaybook" AS ENUM ('OFICIAL', 'DEMONSTRATIVO');

-- CreateEnum
CREATE TYPE "ModoTreinador" AS ENUM ('GERAL', 'ABORDAGEM', 'SONDAGEM', 'DEMONSTRACAO', 'OBJECAO', 'FECHAMENTO', 'VENDA_COMPLEMENTAR', 'PA', 'TICKET', 'POS_VENDA');

-- CreateEnum
CREATE TYPE "StatusConversaTreinador" AS ENUM ('ABERTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "RoleMensagemTreinador" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "specialist" "EspecialistaIA" NOT NULL DEFAULT 'COACH';

-- CreateTable
CREATE TABLE "playbook" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "status" "StatusPlaybook" NOT NULL DEFAULT 'DRAFT',
    "publicadoEm" TIMESTAMP(3),
    "publicadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playbook_section" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "categoria" "CategoriaPlaybook" NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "origem" "OrigemConteudoPlaybook" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playbook_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_conversation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" "StatusConversaTreinador" NOT NULL DEFAULT 'ABERTA',
    "geracaoEmAndamento" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "trainer_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "RoleMensagemTreinador" NOT NULL,
    "content" TEXT NOT NULL,
    "mode" "ModoTreinador",
    "objection" TEXT,
    "playbookVersionId" TEXT,
    "clientMessageId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUSD" DECIMAL(10,6),
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playbook_empresaId_status_idx" ON "playbook"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "playbook_empresaId_versao_key" ON "playbook"("empresaId", "versao");

-- CreateIndex
CREATE INDEX "playbook_section_playbookId_categoria_ativo_idx" ON "playbook_section"("playbookId", "categoria", "ativo");

-- CreateIndex
CREATE INDEX "trainer_conversation_empresaId_lojaId_vendedorId_idx" ON "trainer_conversation"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE INDEX "trainer_message_conversationId_createdAt_idx" ON "trainer_message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_message_conversationId_clientMessageId_key" ON "trainer_message"("conversationId", "clientMessageId");

-- CreateIndex
CREATE INDEX "ai_usage_specialist_createdAt_idx" ON "ai_usage"("specialist", "createdAt");

-- AddForeignKey
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_section" ADD CONSTRAINT "playbook_section_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_conversation" ADD CONSTRAINT "trainer_conversation_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_message" ADD CONSTRAINT "trainer_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "trainer_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_message" ADD CONSTRAINT "trainer_message_playbookVersionId_fkey" FOREIGN KEY ("playbookVersionId") REFERENCES "playbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lição da Fatia 4 (security review): sem essas restrições, chamadas
-- concorrentes podiam criar 2+ conversas ABERTA / 2+ playbooks PUBLISHED
-- pro mesmo vendedor/empresa, furando rate limit/budget ou deixando o
-- Treinador em dúvida sobre qual versão de playbook é a vigente.

-- No máximo 1 conversa ABERTA por vendedor no Treinador (mesma técnica de
-- CoachConversation na Fatia 4).
CREATE UNIQUE INDEX "trainer_conversation_vendedor_aberta_uidx"
  ON "trainer_conversation" ("vendedorId")
  WHERE "status" = 'ABERTA';

-- No máximo 1 playbook PUBLISHED por empresa.
CREATE UNIQUE INDEX "playbook_empresa_published_uidx"
  ON "playbook" ("empresaId")
  WHERE "status" = 'PUBLISHED';
