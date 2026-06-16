-- CreateEnum
CREATE TYPE "ReadinessOverrideStatus" AS ENUM ('MANUAL_READY', 'DISMISSED', 'SNOOZED');

-- CreateTable
CREATE TABLE "ReadinessOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "ReadinessOverrideStatus" NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "note" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessOverride_userId_key_key" ON "ReadinessOverride"("userId", "key");

-- CreateIndex
CREATE INDEX "ReadinessOverride_userId_status_idx" ON "ReadinessOverride"("userId", "status");

-- CreateIndex
CREATE INDEX "ReadinessOverride_snoozedUntil_idx" ON "ReadinessOverride"("snoozedUntil");

-- AddForeignKey
ALTER TABLE "ReadinessOverride" ADD CONSTRAINT "ReadinessOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
