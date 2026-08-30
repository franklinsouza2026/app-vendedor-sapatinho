-- CreateEnum
CREATE TYPE "StatusConteudo" AS ENUM ('DRAFT', 'REVIEW_PENDING', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrigemEditorial" AS ENUM ('OFFICIAL_COMPANY', 'ADMIN_CURATED', 'AI_RESEARCHED', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "PublicoConteudo" AS ENUM ('SELLER', 'MANAGER', 'BOTH');

-- CreateEnum
CREATE TYPE "TipoConteudoAula" AS ENUM ('TEXT', 'VIDEO', 'MATERIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "DificuldadeQuestao" AS ENUM ('BASICA', 'INTERMEDIARIA', 'SITUACIONAL');

-- AlterTable
ALTER TABLE "academy_lesson" ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "audience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "materialUrl" TEXT,
ADD COLUMN     "origemEditorial" "OrigemEditorial" NOT NULL DEFAULT 'ADMIN_CURATED',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "StatusConteudo" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "tipoConteudo" "TipoConteudoAula" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "academy_progress" ADD COLUMN     "ultimaTentativaQuestoesIds" JSONB;

-- AlterTable
ALTER TABLE "academy_question" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "difficulty" "DificuldadeQuestao" NOT NULL DEFAULT 'BASICA',
ADD COLUMN     "sourceContentId" TEXT,
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "academy_quiz" ADD COLUMN     "questionsPerAttempt" INTEGER;

-- AlterTable
ALTER TABLE "academy_track" ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "audience" "PublicoConteudo" NOT NULL DEFAULT 'SELLER',
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "origemEditorial" "OrigemEditorial" NOT NULL DEFAULT 'ADMIN_CURATED',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "StatusConteudo" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "mandamento_oficial" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudoOficial" TEXT,
    "explicacaoOpcional" TEXT,
    "exemploOpcional" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusConteudo" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mandamento_oficial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandamento_oficial_numero_key" ON "mandamento_oficial"("numero");

-- CreateIndex
CREATE INDEX "academy_lesson_status_audience_idx" ON "academy_lesson"("status", "audience");

-- CreateIndex
CREATE INDEX "academy_question_quizId_active_idx" ON "academy_question"("quizId", "active");

-- CreateIndex
CREATE INDEX "academy_track_status_audience_idx" ON "academy_track"("status", "audience");

