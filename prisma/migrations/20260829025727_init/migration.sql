-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('VENDEDOR', 'GERENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "TipoMeta" AS ENUM ('FATURAMENTO', 'TICKET_MEDIO', 'PA');

-- CreateEnum
CREATE TYPE "PeriodoMeta" AS ENUM ('DIA', 'SEMANA', 'MES');

-- CreateTable
CREATE TABLE "empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "matriculaErp" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'VENDEDOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "tipo" "TipoMeta" NOT NULL,
    "periodo" "PeriodoMeta" NOT NULL,
    "referencia" TIMESTAMP(3) NOT NULL,
    "valorMeta" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicador_realizado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "faturamento" DECIMAL(12,2) NOT NULL,
    "ticketMedio" DECIMAL(12,2) NOT NULL,
    "pa" DECIMAL(6,2) NOT NULL,
    "numAtendimentos" INTEGER NOT NULL,
    "fonteJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicador_realizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loja_empresaId_idx" ON "loja"("empresaId");

-- CreateIndex
CREATE INDEX "vendedor_empresaId_lojaId_idx" ON "vendedor"("empresaId", "lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "vendedor_lojaId_matriculaErp_key" ON "vendedor"("lojaId", "matriculaErp");

-- CreateIndex
CREATE INDEX "meta_empresaId_lojaId_idx" ON "meta"("empresaId", "lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_vendedorId_tipo_periodo_referencia_key" ON "meta"("vendedorId", "tipo", "periodo", "referencia");

-- CreateIndex
CREATE INDEX "indicador_realizado_empresaId_lojaId_dataHora_idx" ON "indicador_realizado"("empresaId", "lojaId", "dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_realizado_vendedorId_dataHora_key" ON "indicador_realizado"("vendedorId", "dataHora");

-- AddForeignKey
ALTER TABLE "loja" ADD CONSTRAINT "loja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor" ADD CONSTRAINT "vendedor_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicador_realizado" ADD CONSTRAINT "indicador_realizado_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
