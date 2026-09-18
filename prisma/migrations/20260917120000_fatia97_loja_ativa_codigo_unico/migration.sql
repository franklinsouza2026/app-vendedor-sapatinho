-- AlterTable
ALTER TABLE "loja" ADD COLUMN     "ativa" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "loja_empresaId_codigoErp_key" ON "loja"("empresaId", "codigoErp");

