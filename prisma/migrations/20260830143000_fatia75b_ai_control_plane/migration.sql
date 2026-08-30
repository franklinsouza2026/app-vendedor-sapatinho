-- CreateEnum
CREATE TYPE "NomeProviderIA" AS ENUM ('MOCK', 'ANTHROPIC', 'OPENAI', 'GEMINI');

-- CreateEnum
CREATE TYPE "ModoProviderIA" AS ENUM ('MANUAL');

-- CreateTable
CREATE TABLE "company_ai_configuration" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mode" "ModoProviderIA" NOT NULL DEFAULT 'MANUAL',
    "activeProvider" "NomeProviderIA" NOT NULL DEFAULT 'MOCK',
    "activeModel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "company_ai_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_credential" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provider" "NomeProviderIA" NOT NULL,
    "ciphertextBase64" TEXT NOT NULL,
    "ivBase64" TEXT NOT NULL,
    "authTagBase64" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "ai_provider_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_health" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provider" "NomeProviderIA" NOT NULL,
    "lastCallAt" TIMESTAMP(3),
    "lastCallOk" BOOLEAN,
    "lastErrorType" TEXT,
    "lastLatencyMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_ai_configuration_empresaId_key" ON "company_ai_configuration"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_credential_empresaId_provider_key" ON "ai_provider_credential"("empresaId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_health_empresaId_provider_key" ON "ai_provider_health"("empresaId", "provider");

-- AddForeignKey
ALTER TABLE "company_ai_configuration" ADD CONSTRAINT "company_ai_configuration_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_credential" ADD CONSTRAINT "ai_provider_credential_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_health" ADD CONSTRAINT "ai_provider_health_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

