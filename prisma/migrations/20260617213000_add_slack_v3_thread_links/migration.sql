CREATE TYPE "SlackThreadEntityType" AS ENUM (
  'JOB',
  'APPLICATION',
  'LINKEDIN_DRAFT',
  'INTERVIEW_PREP',
  'FOLLOW_UP',
  'SEARCH_OPTIMIZATION_RUN'
);

CREATE TABLE "SlackThreadLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" "SlackThreadEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "rootMessageTs" TEXT NOT NULL,
  "threadTs" TEXT NOT NULL,
  "sourceAgentRunId" TEXT,
  "title" TEXT,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SlackThreadLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlackThreadLink_userId_entityType_entityId_key" ON "SlackThreadLink"("userId", "entityType", "entityId");
CREATE INDEX "SlackThreadLink_channelId_threadTs_idx" ON "SlackThreadLink"("channelId", "threadTs");
CREATE INDEX "SlackThreadLink_userId_status_updatedAt_idx" ON "SlackThreadLink"("userId", "status", "updatedAt");
CREATE INDEX "SlackThreadLink_sourceAgentRunId_idx" ON "SlackThreadLink"("sourceAgentRunId");

ALTER TABLE "SlackThreadLink" ADD CONSTRAINT "SlackThreadLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlackThreadLink" ADD CONSTRAINT "SlackThreadLink_sourceAgentRunId_fkey" FOREIGN KEY ("sourceAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
