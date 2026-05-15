CREATE TYPE "AnswerMemorySensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AnswerMemoryReusePolicy" AS ENUM ('AUTO_USE', 'ASK_FIRST', 'NEVER_REUSE');

CREATE TABLE "ApplicationAnswerMemory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questionCanonical" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "sensitivity" "AnswerMemorySensitivity" NOT NULL DEFAULT 'MEDIUM',
  "reusePolicy" "AnswerMemoryReusePolicy" NOT NULL DEFAULT 'ASK_FIRST',
  "sourceApplicationId" TEXT,
  "sourceRequestId" TEXT,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApplicationAnswerMemory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApplicationAnswerMemory" ADD CONSTRAINT "ApplicationAnswerMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationAnswerMemory" ADD CONSTRAINT "ApplicationAnswerMemory_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationAnswerMemory" ADD CONSTRAINT "ApplicationAnswerMemory_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "AgentUserRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ApplicationAnswerMemory_userId_questionCanonical_key" ON "ApplicationAnswerMemory"("userId", "questionCanonical");
CREATE INDEX "ApplicationAnswerMemory_userId_reusePolicy_idx" ON "ApplicationAnswerMemory"("userId", "reusePolicy");
CREATE INDEX "ApplicationAnswerMemory_sourceApplicationId_idx" ON "ApplicationAnswerMemory"("sourceApplicationId");
CREATE INDEX "ApplicationAnswerMemory_sourceRequestId_idx" ON "ApplicationAnswerMemory"("sourceRequestId");
