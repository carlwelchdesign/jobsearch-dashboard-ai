CREATE TYPE "ApplicationAutomationRunStatus" AS ENUM ('RUNNING', 'BLOCKED', 'NEEDS_USER', 'READY_TO_SUBMIT', 'SUBMITTED', 'FAILED');

CREATE TABLE "ApplicationAutomationRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "jobPostingId" TEXT NOT NULL,
  "status" "ApplicationAutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "currentUrl" TEXT,
  "logPath" TEXT,
  "pid" INTEGER,
  "blockerType" TEXT,
  "blockerMessage" TEXT,
  "actionsJson" JSONB NOT NULL DEFAULT '[]',
  "screenshotsJson" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApplicationAutomationRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApplicationAutomationRun" ADD CONSTRAINT "ApplicationAutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationAutomationRun" ADD CONSTRAINT "ApplicationAutomationRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationAutomationRun" ADD CONSTRAINT "ApplicationAutomationRun_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ApplicationAutomationRun_userId_status_startedAt_idx" ON "ApplicationAutomationRun"("userId", "status", "startedAt");
CREATE INDEX "ApplicationAutomationRun_applicationId_startedAt_idx" ON "ApplicationAutomationRun"("applicationId", "startedAt");
CREATE INDEX "ApplicationAutomationRun_jobPostingId_startedAt_idx" ON "ApplicationAutomationRun"("jobPostingId", "startedAt");
