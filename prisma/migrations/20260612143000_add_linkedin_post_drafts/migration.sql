ALTER TYPE "AgentType" ADD VALUE 'LINKEDIN_CONTENT';

CREATE TABLE "LinkedInPostDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agentRunId" TEXT,
  "title" TEXT NOT NULL,
  "hook" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "hashtags" JSONB NOT NULL DEFAULT '[]',
  "contentPillar" TEXT NOT NULL,
  "sourceFacts" JSONB NOT NULL DEFAULT '[]',
  "screenshotAssets" JSONB NOT NULL DEFAULT '[]',
  "privacyReview" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LinkedInPostDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LinkedInPostDraft_userId_status_createdAt_idx" ON "LinkedInPostDraft"("userId", "status", "createdAt");
CREATE INDEX "LinkedInPostDraft_agentRunId_idx" ON "LinkedInPostDraft"("agentRunId");

ALTER TABLE "LinkedInPostDraft" ADD CONSTRAINT "LinkedInPostDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LinkedInPostDraft" ADD CONSTRAINT "LinkedInPostDraft_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
