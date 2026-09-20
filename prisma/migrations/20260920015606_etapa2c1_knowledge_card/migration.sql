-- CreateEnum
CREATE TYPE "TipoFonteConhecimento" AS ENUM ('OFICIAL_EMPRESA', 'CIENTIFICO', 'PROFISSIONAL', 'METODOLOGIA', 'DESENVOLVIMENTO_PESSOAL', 'REFLEXIVO', 'DEMONSTRATIVO');

-- CreateEnum
CREATE TYPE "SituacaoLicenca" AS ENUM ('PROPRIO', 'DOMINIO_PUBLICO', 'LICENCIADO', 'TERCEIRO_REFERENCIADO', 'REVISAR');

-- CreateTable
CREATE TABLE "knowledge_card" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "empresaId" TEXT,
    "titulo" TEXT NOT NULL,
    "principio" TEXT NOT NULL,
    "quandoUsar" TEXT NOT NULL,
    "quandoNaoUsar" TEXT NOT NULL,
    "exemplo" TEXT,
    "tipoFonte" "TipoFonteConhecimento" NOT NULL,
    "fonte" TEXT,
    "autor" TEXT,
    "referencia" TEXT,
    "licenca" "SituacaoLicenca" NOT NULL DEFAULT 'REVISAR',
    "notaProvenance" TEXT,
    "audience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
    "origemEditorial" "OrigemEditorial" NOT NULL DEFAULT 'ADMIN_CURATED',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" "StatusConteudo" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_card_status_escolaId_idx" ON "knowledge_card"("status", "escolaId");

-- CreateIndex
CREATE INDEX "knowledge_card_empresaId_status_idx" ON "knowledge_card"("empresaId", "status");

-- AddForeignKey
ALTER TABLE "knowledge_card" ADD CONSTRAINT "knowledge_card_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escola_universidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Invariantes de domínio que o Prisma não expressa — defesa em
-- profundidade, no mesmo espírito do índice único parcial já usado em
-- coach_conversation, playbook, development_plan e coach_intervention.
--
-- O service também valida todas elas e devolve erro legível. O banco
-- existe pra quando alguém escrever direto, ou pra quando uma refatoração
-- futura esquecer a validação do service.
-- ---------------------------------------------------------------------

-- 1. A chave é estável e única POR ESCOPO. Dois índices parciais em vez de
--    um @@unique composto: em Postgres, NULL nunca colide com NULL, então
--    um UNIQUE("empresaId","chave") deixaria passar duas linhas globais com
--    a mesma chave — exatamente o caso que mais importa proteger.
CREATE UNIQUE INDEX "knowledge_card_chave_global_uidx"
  ON "knowledge_card" ("chave")
  WHERE "empresaId" IS NULL;

CREATE UNIQUE INDEX "knowledge_card_chave_empresa_uidx"
  ON "knowledge_card" ("empresaId", "chave")
  WHERE "empresaId" IS NOT NULL;

-- 2. Conteúdo OFICIAL de uma empresa não pode ser GLOBAL. É contradição
--    semântica: "a regra oficial da loja" sem loja nenhuma. Sem esta
--    checagem, uma política interna de uma empresa poderia virar
--    conhecimento de plataforma e alcançar todas as outras.
ALTER TABLE "knowledge_card"
  ADD CONSTRAINT "knowledge_card_oficial_exige_empresa_chk"
  CHECK ("tipoFonte" <> 'OFICIAL_EMPRESA' OR "empresaId" IS NOT NULL);

-- 3. Versão começa em 1 e só cresce. Uma versão 0 ou negativa não
--    significa nada e quebraria a leitura de "qual versão está valendo".
ALTER TABLE "knowledge_card"
  ADD CONSTRAINT "knowledge_card_version_positiva_chk"
  CHECK ("version" >= 1);
