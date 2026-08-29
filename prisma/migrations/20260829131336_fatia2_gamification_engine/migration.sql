-- CreateEnum
CREATE TYPE "TipoEventoGamificacao" AS ENUM ('CHECKIN_DIARIO', 'TREINAMENTO_CONCLUIDO', 'QUIZ_APROVADO', 'META_DIARIA_100', 'META_DIARIA_110', 'META_DIARIA_120', 'META_DIARIA_150', 'MELHORA_PA', 'MELHORA_TICKET', 'STREAK_3', 'STREAK_5', 'STREAK_10', 'MISSAO', 'AJUSTE_MANUAL', 'REVERSAO');

-- CreateEnum
CREATE TYPE "EscopoRanking" AS ENUM ('LOJA', 'REDE');

-- CreateEnum
CREATE TYPE "TipoRanking" AS ENUM ('FATURAMENTO', 'PERCENTUAL_META', 'PA', 'TICKET', 'EVOLUCAO', 'MOEDAS', 'SCORE_GERAL');

-- CreateTable
CREATE TABLE "regra_gamificacao_versao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "regrasXp" JSONB NOT NULL,
    "regrasMoeda" JSONB NOT NULL,
    "pesosScore" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "regra_gamificacao_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_transacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipoEvento" "TipoEventoGamificacao" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "regraVersao" INTEGER NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moeda_transacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipoEvento" "TipoEventoGamificacao" NOT NULL,
    "valor" INTEGER NOT NULL,
    "referenciaTipo" TEXT,
    "referenciaId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "regraVersao" INTEGER NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moeda_transacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_vendedor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'META_DIARIA',
    "streakAtual" INTEGER NOT NULL DEFAULT 0,
    "maiorStreak" INTEGER NOT NULL DEFAULT 0,
    "ultimaDataContada" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streak_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_checagem" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "atingiu" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_checagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_concessao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "concedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_concessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baseline_pessoal" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "amostras" INTEGER NOT NULL,
    "amostraMinima" INTEGER NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "baseline_pessoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshot" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "escopo" "EscopoRanking" NOT NULL,
    "lojaId" TEXT,
    "tipo" "TipoRanking" NOT NULL,
    "periodo" "PeriodoMeta" NOT NULL,
    "referencia" TIMESTAMP(3) NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "posicao" INTEGER NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "provisorio" BOOLEAN NOT NULL DEFAULT false,
    "regraVersao" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regra_gamificacao_versao_empresaId_ativo_idx" ON "regra_gamificacao_versao"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "regra_gamificacao_versao_empresaId_versao_key" ON "regra_gamificacao_versao"("empresaId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "xp_transacao_idempotencyKey_key" ON "xp_transacao"("idempotencyKey");

-- CreateIndex
CREATE INDEX "xp_transacao_empresaId_lojaId_vendedorId_idx" ON "xp_transacao"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "moeda_transacao_idempotencyKey_key" ON "moeda_transacao"("idempotencyKey");

-- CreateIndex
CREATE INDEX "moeda_transacao_empresaId_lojaId_vendedorId_idx" ON "moeda_transacao"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "streak_vendedor_vendedorId_key" ON "streak_vendedor"("vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "streak_checagem_vendedorId_tipo_data_key" ON "streak_checagem"("vendedorId", "tipo", "data");

-- CreateIndex
CREATE UNIQUE INDEX "badge_codigo_key" ON "badge"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "badge_concessao_idempotencyKey_key" ON "badge_concessao"("idempotencyKey");

-- CreateIndex
CREATE INDEX "badge_concessao_empresaId_lojaId_vendedorId_idx" ON "badge_concessao"("empresaId", "lojaId", "vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "baseline_pessoal_vendedorId_metrica_key" ON "baseline_pessoal"("vendedorId", "metrica");

-- CreateIndex
CREATE INDEX "ranking_snapshot_empresaId_escopo_lojaId_tipo_periodo_refer_idx" ON "ranking_snapshot"("empresaId", "escopo", "lojaId", "tipo", "periodo", "referencia");

-- AddForeignKey
ALTER TABLE "xp_transacao" ADD CONSTRAINT "xp_transacao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moeda_transacao" ADD CONSTRAINT "moeda_transacao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_vendedor" ADD CONSTRAINT "streak_vendedor_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_concessao" ADD CONSTRAINT "badge_concessao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_concessao" ADD CONSTRAINT "badge_concessao_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshot" ADD CONSTRAINT "ranking_snapshot_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
