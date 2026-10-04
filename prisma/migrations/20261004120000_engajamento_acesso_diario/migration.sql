-- Engajamento: acesso diário (check-in), configuração da recompensa e eventos.
-- Puramente ADITIVA e retrocompatível: novo enum, novo valor de enum, nova
-- coluna com default (empresa.timezone) e três tabelas novas. Nenhum dado
-- existente é alterado.

-- CreateEnum
CREATE TYPE "TipoEventoEngajamento" AS ENUM ('MISSAO_CONCLUIDA', 'DESAFIO_CONCLUIDO', 'AULA_CONCLUIDA', 'QUIZ_APROVADO', 'SIMULACAO_CONCLUIDA');

-- AlterEnum
ALTER TYPE "TipoEventoGamificacao" ADD VALUE 'ACESSO_DIARIO';

-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- CreateTable
CREATE TABLE "acesso_diario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "primeiroAcessoEm" TIMESTAMP(3) NOT NULL,
    "ultimoAcessoEm" TIMESTAMP(3) NOT NULL,
    "quantidadeAcessos" INTEGER NOT NULL DEFAULT 1,
    "recompensaConcedida" BOOLEAN NOT NULL DEFAULT false,
    "xpConcedido" INTEGER NOT NULL DEFAULT 0,
    "moedasConcedidas" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_recompensa_acesso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "moedas" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT,

    CONSTRAINT "config_recompensa_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_engajamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipo" "TipoEventoEngajamento" NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "metadata" JSONB,
    "dia" DATE NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chave" TEXT NOT NULL,

    CONSTRAINT "evento_engajamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acesso_diario_empresaId_dia_idx" ON "acesso_diario"("empresaId", "dia");

-- CreateIndex
CREATE INDEX "acesso_diario_empresaId_lojaId_dia_idx" ON "acesso_diario"("empresaId", "lojaId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "acesso_diario_vendedorId_dia_key" ON "acesso_diario"("vendedorId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "config_recompensa_acesso_empresaId_key" ON "config_recompensa_acesso"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "evento_engajamento_chave_key" ON "evento_engajamento"("chave");

-- CreateIndex
CREATE INDEX "evento_engajamento_empresaId_dia_idx" ON "evento_engajamento"("empresaId", "dia");

-- CreateIndex
CREATE INDEX "evento_engajamento_vendedorId_ocorridoEm_idx" ON "evento_engajamento"("vendedorId", "ocorridoEm");

