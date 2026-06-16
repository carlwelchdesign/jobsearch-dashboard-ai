-- AlterTable
ALTER TABLE "Application" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ApplicationEvent"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "actorId" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "beforeJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "afterJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "entityVersion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEvent_applicationId_idempotencyKey_key" ON "ApplicationEvent"("applicationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_source_createdAt_idx" ON "ApplicationEvent"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_idempotencyKey_idx" ON "ApplicationEvent"("idempotencyKey");
