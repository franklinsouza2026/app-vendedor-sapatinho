-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'BLOCKED', 'OFFBOARDED');

-- CreateEnum
CREATE TYPE "StatusTokenAtivacao" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ErpProvider" AS ENUM ('LINX');

-- CreateEnum
CREATE TYPE "MetodoVinculoErp" AS ENUM ('CPF', 'EXTERNAL_ID', 'SELLER_CODE', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatusVinculoErp" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "vendedor" DROP COLUMN "ativo",
ADD COLUMN     "cpfHash" TEXT,
ADD COLUMN     "cpfUltimosDigitos" TEXT,
ADD COLUMN     "status" "StatusConta" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "senhaHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "activation_token" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "StatusTokenAtivacao" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "provider" "ErpProvider" NOT NULL,
    "externalSellerId" TEXT,
    "externalEmployeeId" TEXT,
    "externalStoreId" TEXT,
    "matchMethod" "MetodoVinculoErp" NOT NULL,
    "status" "StatusVinculoErp" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "acao" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activation_token_tokenHash_key" ON "activation_token"("tokenHash");

-- CreateIndex
CREATE INDEX "activation_token_vendedorId_status_idx" ON "activation_token"("vendedorId", "status");

-- CreateIndex
CREATE INDEX "external_identity_empresaId_provider_idx" ON "external_identity"("empresaId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_vendedorId_provider_key" ON "external_identity"("vendedorId", "provider");

-- CreateIndex
CREATE INDEX "audit_event_empresaId_createdAt_idx" ON "audit_event"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_targetId_idx" ON "audit_event"("targetId");

-- CreateIndex
CREATE INDEX "vendedor_empresaId_status_idx" ON "vendedor"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendedor_empresaId_cpfHash_key" ON "vendedor"("empresaId", "cpfHash");

-- AddForeignKey
ALTER TABLE "activation_token" ADD CONSTRAINT "activation_token_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

