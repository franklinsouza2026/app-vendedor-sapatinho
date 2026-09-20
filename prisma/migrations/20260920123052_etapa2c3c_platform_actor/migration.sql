-- CreateTable
CREATE TABLE "platform_actor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_event" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "recursoTipo" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_actor_nome_key" ON "platform_actor"("nome");

-- CreateIndex
CREATE INDEX "platform_audit_event_recursoTipo_recursoId_idx" ON "platform_audit_event"("recursoTipo", "recursoId");

-- CreateIndex
CREATE INDEX "platform_audit_event_actorId_createdAt_idx" ON "platform_audit_event"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "platform_audit_event" ADD CONSTRAINT "platform_audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "platform_actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
