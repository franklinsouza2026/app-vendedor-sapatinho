-- Linx L2 (2026-10-05): cursor incremental por integração/método/escopo, trava
-- de sincronização, ajustes pendentes (fora de ordem) e contadores da execução.
-- Estritamente ADITIVA: só CREATE TYPE/TABLE/INDEX, ADD COLUMN com default e FK nova.

-- CreateEnum
CREATE TYPE "TipoExecucaoIntegracao" AS ENUM ('SYNC', 'RECONCILIACAO');

-- CreateEnum
CREATE TYPE "FaseCursorIntegracao" AS ENUM ('BACKFILL', 'CATCH_UP', 'LIVE');

-- AlterTable
ALTER TABLE "integracao" ADD COLUMN     "syncTravadaAte" TIMESTAMP(3),
ADD COLUMN     "syncTravadaPor" TEXT;

-- AlterTable
ALTER TABLE "integracao_execucao" ADD COLUMN     "cancelamentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "devolucoes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paginas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendentes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" "TipoExecucaoIntegracao" NOT NULL DEFAULT 'SYNC';

-- CreateTable
CREATE TABLE "integracao_cursor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "valor" BIGINT NOT NULL DEFAULT 0,
    "fase" "FaseCursorIntegracao" NOT NULL DEFAULT 'BACKFILL',
    "registrosProcessados" INTEGER NOT NULL DEFAULT 0,
    "ultimoAvancoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracao_cursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venda_ajuste_pendente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "integracaoId" TEXT,
    "tipo" "TipoAjusteVenda" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "vendaIdExterno" TEXT NOT NULL,
    "evento" JSONB NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimaTentativaEm" TIMESTAMP(3),

    CONSTRAINT "venda_ajuste_pendente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integracao_cursor_empresaId_idx" ON "integracao_cursor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_cursor_integracaoId_metodo_escopo_key" ON "integracao_cursor"("integracaoId", "metodo", "escopo");

-- CreateIndex
CREATE INDEX "venda_ajuste_pendente_empresaId_vendaIdExterno_idx" ON "venda_ajuste_pendente"("empresaId", "vendaIdExterno");

-- CreateIndex
CREATE UNIQUE INDEX "venda_ajuste_pendente_empresaId_idExterno_key" ON "venda_ajuste_pendente"("empresaId", "idExterno");

-- AddForeignKey
ALTER TABLE "integracao_cursor" ADD CONSTRAINT "integracao_cursor_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "integracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

