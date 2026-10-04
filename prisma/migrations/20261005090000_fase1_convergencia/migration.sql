-- CreateEnum
CREATE TYPE "EscopoCompeticao" AS ENUM ('TODAS', 'POR_LOJA');

-- CreateEnum
CREATE TYPE "StatusCiclo" AS ENUM ('RASCUNHO', 'PROGRAMADA', 'ATIVA', 'ENCERRADA', 'ARQUIVADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('VALIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAjusteVenda" AS ENUM ('CANCELAMENTO', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "TipoPremio" AS ENUM ('DIGITAL', 'EMPRESARIAL');

-- CreateEnum
CREATE TYPE "CategoriaPremio" AS ENUM ('DINHEIRO', 'VALE', 'PRODUTO', 'EXPERIENCIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "MecanismoFrente" AS ENUM ('COMPETICAO', 'META_MES', 'MISSAO');

-- CreateEnum
CREATE TYPE "ProvedorIntegracao" AS ENUM ('LINX', 'MOCK', 'CONTROLADO');

-- CreateEnum
CREATE TYPE "StatusIntegracao" AS ENUM ('CONFIGURANDO', 'ATIVA', 'DESATIVADA');

-- CreateEnum
CREATE TYPE "StatusExecucaoIntegracao" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'ERRO');

-- AlterEnum
ALTER TYPE "CategoriaMissao" ADD VALUE 'SALES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CriterioMissao" ADD VALUE 'VENDAS_PERIODO';
ALTER TYPE "CriterioMissao" ADD VALUE 'FATURAMENTO_PERIODO';
ALTER TYPE "CriterioMissao" ADD VALUE 'PARES_PRODUTOS';
ALTER TYPE "CriterioMissao" ADD VALUE 'VENDAS_PRODUTOS';
ALTER TYPE "CriterioMissao" ADD VALUE 'VENDAS_MULTIPAR';
ALTER TYPE "CriterioMissao" ADD VALUE 'VENDAS_CATEGORIA';
ALTER TYPE "CriterioMissao" ADD VALUE 'PARES_CATEGORIA';
ALTER TYPE "CriterioMissao" ADD VALUE 'DIAS_TICKET_ACIMA';
ALTER TYPE "CriterioMissao" ADD VALUE 'DIAS_META_SEGUIDOS';

-- AlterEnum
ALTER TYPE "PeriodoMissao" ADD VALUE 'PERSONALIZADO';

-- AlterEnum
ALTER TYPE "StatusCompeticao" ADD VALUE 'ARCHIVED';

-- AlterEnum
ALTER TYPE "TipoAcaoMissao" ADD VALUE 'SALES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMetricaCompeticao" ADD VALUE 'FATURAMENTO';
ALTER TYPE "TipoMetricaCompeticao" ADD VALUE 'QTD_VENDAS';
ALTER TYPE "TipoMetricaCompeticao" ADD VALUE 'PARES_CATEGORIA';

-- AlterEnum
ALTER TYPE "TipoRanking" ADD VALUE 'CONSISTENCIA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoReconhecimento" ADD VALUE 'INITIATIVE';
ALTER TYPE "TipoReconhecimento" ADD VALUE 'OVERCOMING';

-- AlterTable
ALTER TABLE "badge_concessao" ADD COLUMN     "revogadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "competition" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "canceladaMotivo" TEXT,
ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "escopo" "EscopoCompeticao" NOT NULL DEFAULT 'TODAS',
ADD COLUMN     "formato" TEXT,
ADD COLUMN     "lojaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "premioIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "regra" TEXT,
ADD COLUMN     "tipoExibicao" TEXT,
ADD COLUMN     "todasLojas" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "feed_event" ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "revogadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "indicador_realizado" ADD COLUMN     "pares" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pecas" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "league" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "mission_definition" ADD COLUMN     "alvo" DECIMAL(12,2),
ADD COLUMN     "canceladaMotivo" TEXT,
ADD COLUMN     "criadoPor" TEXT,
ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "encerradaEm" TIMESTAMP(3),
ADD COLUMN     "fim" TIMESTAMP(3),
ADD COLUMN     "inicio" TIMESTAMP(3),
ADD COLUMN     "lojaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "moedas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parametros" JSONB,
ADD COLUMN     "premioId" TEXT,
ADD COLUMN     "produtos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "regras" TEXT,
ADD COLUMN     "statusCiclo" "StatusCiclo",
ADD COLUMN     "template" TEXT,
ADD COLUMN     "tipoExibicao" TEXT,
ADD COLUMN     "todasLojas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unidade" TEXT,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ranking_snapshot" ADD COLUMN     "dia" DATE;

-- AlterTable
ALTER TABLE "recognition" ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "titulo" TEXT;

-- AlterTable
ALTER TABLE "season" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "vendedor" ADD COLUMN     "admitidoEm" DATE,
ADD COLUMN     "elegivelRanking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "motivoInelegivel" TEXT,
ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Backfill de tenant (D8). Migration aditiva e segura: as colunas nascem
-- nulas, são preenchidas a partir de dados já existentes (criador, loja,
-- vendedor) e só então viram NOT NULL. Em bancos com uma única empresa (todo
-- ambiente existente hoje), o fallback é essa empresa.
-- ---------------------------------------------------------------------------
UPDATE "competition" c SET "empresaId" = v."empresaId" FROM "vendedor" v WHERE c."empresaId" IS NULL AND v."id" = c."createdBy";
UPDATE "competition" SET "empresaId" = (SELECT "id" FROM "empresa" ORDER BY "createdAt" ASC LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "season" s SET "empresaId" = v."empresaId" FROM "vendedor" v WHERE s."empresaId" IS NULL AND v."id" = s."createdBy";
UPDATE "season" SET "empresaId" = (SELECT "id" FROM "empresa" ORDER BY "createdAt" ASC LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "league" SET "empresaId" = (SELECT "id" FROM "empresa" ORDER BY "createdAt" ASC LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "recognition" r SET "empresaId" = v."empresaId" FROM "vendedor" v WHERE r."empresaId" IS NULL AND v."id" = r."subjectId";
UPDATE "recognition" SET "empresaId" = (SELECT "id" FROM "empresa" ORDER BY "createdAt" ASC LIMIT 1) WHERE "empresaId" IS NULL;
UPDATE "feed_event" f SET "empresaId" = l."empresaId" FROM "loja" l WHERE f."empresaId" IS NULL AND l."id" = f."lojaId";
UPDATE "feed_event" f SET "empresaId" = v."empresaId" FROM "vendedor" v WHERE f."empresaId" IS NULL AND v."id" = f."subjectId";
UPDATE "feed_event" f SET "empresaId" = v."empresaId" FROM "vendedor" v WHERE f."empresaId" IS NULL AND v."id" = f."actorId";
UPDATE "feed_event" SET "empresaId" = (SELECT "id" FROM "empresa" ORDER BY "createdAt" ASC LIMIT 1) WHERE "empresaId" IS NULL;

ALTER TABLE "competition" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "season" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "league" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "recognition" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "feed_event" ALTER COLUMN "empresaId" SET NOT NULL;

-- Códigos de competição/temporada/liga passam a ser únicos POR EMPRESA (D8):
-- duas empresas podem ter a liga "bronze" ou a temporada "2026-T1".
DROP INDEX "competition_code_key";
DROP INDEX "season_code_key";
DROP INDEX "league_code_key";
CREATE UNIQUE INDEX "competition_empresaId_code_key" ON "competition"("empresaId", "code");
CREATE UNIQUE INDEX "season_empresaId_code_key" ON "season"("empresaId", "code");
CREATE UNIQUE INDEX "league_empresaId_code_key" ON "league"("empresaId", "code");

-- CreateTable
CREATE TABLE "venda" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "integracaoId" TEXT,
    "idExterno" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "pecas" INTEGER NOT NULL,
    "pares" INTEGER NOT NULL,
    "status" "StatusVenda" NOT NULL DEFAULT 'VALIDA',
    "canceladaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venda_item" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "quantidade" INTEGER NOT NULL,
    "pares" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "quantidadeDevolvida" INTEGER NOT NULL DEFAULT 0,
    "paresDevolvidos" INTEGER NOT NULL DEFAULT 0,
    "valorDevolvido" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "venda_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venda_ajuste" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "tipo" "TipoAjusteVenda" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "pecas" INTEGER NOT NULL,
    "pares" INTEGER NOT NULL,
    "itens" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venda_ajuste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dias_trabalho_mes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT NOT NULL,

    CONSTRAINT "dias_trabalho_mes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_loja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT NOT NULL,

    CONSTRAINT "meta_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL,
    "foto" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPremio" NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "moedas" INTEGER NOT NULL DEFAULT 0,
    "badgeCodigo" TEXT,
    "categoria" "CategoriaPremio",
    "descricao" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "premio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanha" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "regras" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" "StatusCiclo" NOT NULL DEFAULT 'RASCUNHO',
    "todasLojas" BOOLEAN NOT NULL DEFAULT true,
    "lojaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultado" JSONB,
    "encerradaEm" TIMESTAMP(3),
    "canceladaMotivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanha_frente" (
    "id" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "icone" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mecanismo" "MecanismoFrente" NOT NULL,
    "competicaoId" TEXT,
    "missaoId" TEXT,
    "premioId" TEXT,

    CONSTRAINT "campanha_frente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_fase1" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "metricasRanking" TEXT[],
    "metricaCorrida" TEXT NOT NULL,
    "lojaXLojaAtivo" BOOLEAN NOT NULL DEFAULT false,
    "lojaXLojaFormula" TEXT,
    "lojaXLojaLojas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "indicadores" JSONB NOT NULL,
    "feedTipos" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT NOT NULL,

    CONSTRAINT "config_fase1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" "ProvedorIntegracao" NOT NULL,
    "status" "StatusIntegracao" NOT NULL DEFAULT 'CONFIGURANDO',
    "configuracao" JSONB NOT NULL DEFAULT '{}',
    "credencialCiphertext" TEXT,
    "credencialIv" TEXT,
    "credencialAuthTag" TEXT,
    "credencialKeyVersion" INTEGER,
    "credencialSufixo" TEXT,
    "credencialAtualizadaEm" TIMESTAMP(3),
    "cursorSync" TIMESTAMP(3),
    "ultimaSyncEm" TIMESTAMP(3),
    "ultimaSyncSucessoEm" TIMESTAMP(3),
    "ultimaVendaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT NOT NULL,

    CONSTRAINT "integracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_loja" (
    "id" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "codigoExterno" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integracao_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_execucao" (
    "id" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "status" "StatusExecucaoIntegracao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "eventosRecebidos" INTEGER NOT NULL DEFAULT 0,
    "vendasNovas" INTEGER NOT NULL DEFAULT 0,
    "ajustesNovos" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,

    CONSTRAINT "integracao_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "nome" TEXT NOT NULL,
    "ultimoEm" TIMESTAMP(3) NOT NULL,
    "info" JSONB,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("nome")
);

-- CreateIndex
CREATE INDEX "venda_vendedorId_dia_idx" ON "venda"("vendedorId", "dia");

-- CreateIndex
CREATE INDEX "venda_empresaId_dia_idx" ON "venda"("empresaId", "dia");

-- CreateIndex
CREATE INDEX "venda_empresaId_lojaId_dia_idx" ON "venda"("empresaId", "lojaId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "venda_empresaId_idExterno_key" ON "venda"("empresaId", "idExterno");

-- CreateIndex
CREATE INDEX "venda_item_vendaId_idx" ON "venda_item"("vendaId");

-- CreateIndex
CREATE INDEX "venda_item_referencia_idx" ON "venda_item"("referencia");

-- CreateIndex
CREATE INDEX "venda_ajuste_vendaId_idx" ON "venda_ajuste"("vendaId");

-- CreateIndex
CREATE UNIQUE INDEX "venda_ajuste_empresaId_idExterno_key" ON "venda_ajuste"("empresaId", "idExterno");

-- CreateIndex
CREATE INDEX "dias_trabalho_mes_empresaId_mes_idx" ON "dias_trabalho_mes"("empresaId", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "dias_trabalho_mes_vendedorId_mes_key" ON "dias_trabalho_mes"("vendedorId", "mes");

-- CreateIndex
CREATE INDEX "meta_loja_empresaId_mes_idx" ON "meta_loja"("empresaId", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "meta_loja_lojaId_mes_key" ON "meta_loja"("lojaId", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "produto_empresaId_referencia_key" ON "produto"("empresaId", "referencia");

-- CreateIndex
CREATE INDEX "premio_empresaId_idx" ON "premio"("empresaId");

-- CreateIndex
CREATE INDEX "campanha_empresaId_status_idx" ON "campanha"("empresaId", "status");

-- CreateIndex
CREATE INDEX "campanha_frente_campanhaId_idx" ON "campanha_frente"("campanhaId");

-- CreateIndex
CREATE UNIQUE INDEX "config_fase1_empresaId_key" ON "config_fase1"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_empresaId_provedor_key" ON "integracao"("empresaId", "provedor");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_loja_integracaoId_codigoExterno_key" ON "integracao_loja"("integracaoId", "codigoExterno");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_loja_integracaoId_lojaId_key" ON "integracao_loja"("integracaoId", "lojaId");

-- CreateIndex
CREATE INDEX "integracao_execucao_integracaoId_iniciadaEm_idx" ON "integracao_execucao"("integracaoId", "iniciadaEm");

-- CreateIndex
CREATE INDEX "integracao_execucao_empresaId_iniciadaEm_idx" ON "integracao_execucao"("empresaId", "iniciadaEm");

-- CreateIndex
CREATE INDEX "competition_empresaId_status_idx" ON "competition"("empresaId", "status");

-- CreateIndex
CREATE INDEX "feed_event_empresaId_createdAt_idx" ON "feed_event"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "mission_definition_empresaId_statusCiclo_idx" ON "mission_definition"("empresaId", "statusCiclo");

-- CreateIndex
CREATE INDEX "ranking_snapshot_empresaId_escopo_tipo_periodo_referencia_d_idx" ON "ranking_snapshot"("empresaId", "escopo", "tipo", "periodo", "referencia", "dia");

-- CreateIndex
CREATE INDEX "recognition_empresaId_createdAt_idx" ON "recognition"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "venda_item" ADD CONSTRAINT "venda_item_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venda_ajuste" ADD CONSTRAINT "venda_ajuste_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_frente" ADD CONSTRAINT "campanha_frente_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "campanha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_loja" ADD CONSTRAINT "integracao_loja_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "integracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_execucao" ADD CONSTRAINT "integracao_execucao_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "integracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

