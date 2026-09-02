-- CreateEnum
CREATE TYPE "StatusSeason" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TipoParticipante" AS ENUM ('SELLER', 'STORE');

-- CreateEnum
CREATE TYPE "TipoMetricaCompeticao" AS ENUM ('GOAL_ATTAINMENT', 'PERSONAL_IMPROVEMENT', 'SCORE_GERAL', 'PA', 'TICKET_MEDIO', 'TRAINING', 'COMPETENCY_EVOLUTION', 'MISSION_COMPLETION', 'CONSISTENCY', 'CUSTOM_RULE');

-- CreateEnum
CREATE TYPE "StatusCompeticao" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatusParticipacaoCompeticao" AS ENUM ('ELIGIBLE', 'ACTIVE', 'DISQUALIFIED', 'FINISHED');

-- CreateEnum
CREATE TYPE "TipoReconhecimento" AS ENUM ('PERFORMANCE', 'EVOLUTION', 'LEARNING', 'TEAMWORK', 'CONSISTENCY', 'LEADERSHIP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VisibilidadeFeed" AS ENUM ('PRIVATE', 'STORE', 'COMPANY');

-- AlterEnum
ALTER TYPE "TipoEventoGamificacao" ADD VALUE 'COMPETICAO';

-- CreateTable
CREATE TABLE "season" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "StatusSeason" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "registrationStartsAt" TIMESTAMP(3),
    "registrationEndsAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_point_ledger" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "participantType" "TipoParticipante" NOT NULL,
    "participantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "participantType" "TipoParticipante" NOT NULL,
    "metricType" "TipoMetricaCompeticao" NOT NULL,
    "status" "StatusCompeticao" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "minDiasAtivos" INTEGER NOT NULL DEFAULT 5,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "rewardMoedas" INTEGER NOT NULL DEFAULT 0,
    "rewardBadgeCodigo" TEXT,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_participant" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantType" "TipoParticipante" NOT NULL,
    "participantId" TEXT NOT NULL,
    "status" "StatusParticipacaoCompeticao" NOT NULL DEFAULT 'ELIGIBLE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifiedReason" TEXT,
    "disqualifiedBy" TEXT,

    CONSTRAINT "competition_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_result" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantType" "TipoParticipante" NOT NULL,
    "participantId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(14,4) NOT NULL,
    "points" INTEGER NOT NULL,
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "promotionThreshold" INTEGER,
    "relegationThreshold" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_membership" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "leagueId" TEXT NOT NULL,
    "participantType" "TipoParticipante" NOT NULL,
    "participantId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "league_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition" (
    "id" TEXT NOT NULL,
    "tipo" "TipoReconhecimento" NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_event" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT,
    "actorId" TEXT,
    "subjectId" TEXT,
    "eventType" TEXT NOT NULL,
    "visibility" "VisibilidadeFeed" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_code_key" ON "season"("code");

-- CreateIndex
CREATE INDEX "season_status_idx" ON "season"("status");

-- CreateIndex
CREATE INDEX "season_point_ledger_seasonId_participantType_participantId_idx" ON "season_point_ledger"("seasonId", "participantType", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "season_point_ledger_seasonId_participantType_participantId__key" ON "season_point_ledger"("seasonId", "participantType", "participantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_code_key" ON "competition"("code");

-- CreateIndex
CREATE INDEX "competition_status_idx" ON "competition"("status");

-- CreateIndex
CREATE INDEX "competition_seasonId_idx" ON "competition"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_participant_competitionId_participantType_parti_key" ON "competition_participant"("competitionId", "participantType", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_result_competitionId_participantType_participan_key" ON "competition_result"("competitionId", "participantType", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "league_code_key" ON "league"("code");

-- CreateIndex
CREATE INDEX "league_membership_participantType_participantId_exitedAt_idx" ON "league_membership"("participantType", "participantId", "exitedAt");

-- CreateIndex
CREATE INDEX "league_membership_seasonId_idx" ON "league_membership"("seasonId");

-- CreateIndex
CREATE INDEX "recognition_subjectId_idx" ON "recognition"("subjectId");

-- CreateIndex
CREATE INDEX "feed_event_visibility_lojaId_createdAt_idx" ON "feed_event"("visibility", "lojaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feed_event_eventType_sourceType_sourceId_key" ON "feed_event"("eventType", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "season_point_ledger" ADD CONSTRAINT "season_point_ledger_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition" ADD CONSTRAINT "competition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_participant" ADD CONSTRAINT "competition_participant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_result" ADD CONSTRAINT "competition_result_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_membership" ADD CONSTRAINT "league_membership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "league"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

