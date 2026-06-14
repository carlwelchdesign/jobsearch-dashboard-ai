ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'JOLENE_EMAIL_OPERATIONS';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_INBOX_SCOUT';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_APPLICATION_MATCHER';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_OUTCOME_CLASSIFIER';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_SCHEDULING_COORDINATOR';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_ACTION_DRAFTER';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_PRIVACY_REVIEWER';
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'EMAIL_OPS_REPORTER';

CREATE TYPE "EmailOpsFindingStatus" AS ENUM ('AUTO_APPLIED', 'NEEDS_APPROVAL', 'APPROVED', 'DISMISSED', 'BLOCKED');
CREATE TYPE "CalendarProposalStatus" AS ENUM ('DRAFT', 'APPROVED', 'DISMISSED');

CREATE TABLE "EmailOpsFinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "emailMessageRecordId" TEXT,
    "matchedApplicationId" TEXT,
    "matchedJobPostingId" TEXT,
    "classification" "EmailMessageClassification" NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "status" "EmailOpsFindingStatus" NOT NULL DEFAULT 'NEEDS_APPROVAL',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "reviewReason" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '[]',
    "extractedJson" JSONB NOT NULL DEFAULT '{}',
    "suggestedMutationJson" JSONB NOT NULL DEFAULT '{}',
    "provenanceJson" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOpsFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarEventProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "findingId" TEXT,
    "emailMessageRecordId" TEXT,
    "applicationId" TEXT,
    "jobPostingId" TEXT,
    "status" "CalendarProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "timezone" TEXT,
    "location" TEXT,
    "meetingUrl" TEXT,
    "attendeesJson" JSONB NOT NULL DEFAULT '[]',
    "sourceSummary" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "approvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailOpsFinding_userId_status_createdAt_idx" ON "EmailOpsFinding"("userId", "status", "createdAt");
CREATE INDEX "EmailOpsFinding_agentRunId_idx" ON "EmailOpsFinding"("agentRunId");
CREATE INDEX "EmailOpsFinding_emailMessageRecordId_idx" ON "EmailOpsFinding"("emailMessageRecordId");
CREATE INDEX "EmailOpsFinding_matchedApplicationId_createdAt_idx" ON "EmailOpsFinding"("matchedApplicationId", "createdAt");
CREATE INDEX "EmailOpsFinding_matchedJobPostingId_createdAt_idx" ON "EmailOpsFinding"("matchedJobPostingId", "createdAt");

CREATE INDEX "CalendarEventProposal_userId_status_createdAt_idx" ON "CalendarEventProposal"("userId", "status", "createdAt");
CREATE INDEX "CalendarEventProposal_findingId_idx" ON "CalendarEventProposal"("findingId");
CREATE INDEX "CalendarEventProposal_emailMessageRecordId_idx" ON "CalendarEventProposal"("emailMessageRecordId");
CREATE INDEX "CalendarEventProposal_applicationId_createdAt_idx" ON "CalendarEventProposal"("applicationId", "createdAt");
CREATE INDEX "CalendarEventProposal_jobPostingId_createdAt_idx" ON "CalendarEventProposal"("jobPostingId", "createdAt");

ALTER TABLE "EmailOpsFinding" ADD CONSTRAINT "EmailOpsFinding_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOpsFinding" ADD CONSTRAINT "EmailOpsFinding_emailMessageRecordId_fkey" FOREIGN KEY ("emailMessageRecordId") REFERENCES "EmailMessageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOpsFinding" ADD CONSTRAINT "EmailOpsFinding_matchedApplicationId_fkey" FOREIGN KEY ("matchedApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOpsFinding" ADD CONSTRAINT "EmailOpsFinding_matchedJobPostingId_fkey" FOREIGN KEY ("matchedJobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailOpsFinding" ADD CONSTRAINT "EmailOpsFinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEventProposal" ADD CONSTRAINT "CalendarEventProposal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEventProposal" ADD CONSTRAINT "CalendarEventProposal_emailMessageRecordId_fkey" FOREIGN KEY ("emailMessageRecordId") REFERENCES "EmailMessageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEventProposal" ADD CONSTRAINT "CalendarEventProposal_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "EmailOpsFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEventProposal" ADD CONSTRAINT "CalendarEventProposal_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEventProposal" ADD CONSTRAINT "CalendarEventProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
