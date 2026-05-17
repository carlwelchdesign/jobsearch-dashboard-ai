CREATE TYPE "ApplicationFieldMemoryStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'DISABLED');

CREATE TABLE "ApplicationFieldMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceApplicationId" TEXT,
    "formPatternId" TEXT,
    "atsProvider" "AtsProvider" NOT NULL DEFAULT 'unknown',
    "host" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "inputType" TEXT,
    "selector" TEXT,
    "answer" TEXT NOT NULL,
    "sensitivity" "AnswerMemorySensitivity" NOT NULL DEFAULT 'MEDIUM',
    "reusePolicy" "AnswerMemoryReusePolicy" NOT NULL DEFAULT 'ASK_FIRST',
    "status" "ApplicationFieldMemoryStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationFieldMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationFieldMemory_userId_host_fieldKey_category_key" ON "ApplicationFieldMemory"("userId", "host", "fieldKey", "category");
CREATE INDEX "ApplicationFieldMemory_userId_status_updatedAt_idx" ON "ApplicationFieldMemory"("userId", "status", "updatedAt");
CREATE INDEX "ApplicationFieldMemory_userId_atsProvider_host_idx" ON "ApplicationFieldMemory"("userId", "atsProvider", "host");
CREATE INDEX "ApplicationFieldMemory_userId_category_idx" ON "ApplicationFieldMemory"("userId", "category");
CREATE INDEX "ApplicationFieldMemory_formPatternId_idx" ON "ApplicationFieldMemory"("formPatternId");
CREATE INDEX "ApplicationFieldMemory_sourceApplicationId_idx" ON "ApplicationFieldMemory"("sourceApplicationId");

ALTER TABLE "ApplicationFieldMemory" ADD CONSTRAINT "ApplicationFieldMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationFieldMemory" ADD CONSTRAINT "ApplicationFieldMemory_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationFieldMemory" ADD CONSTRAINT "ApplicationFieldMemory_formPatternId_fkey" FOREIGN KEY ("formPatternId") REFERENCES "ApplicationFormPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;
