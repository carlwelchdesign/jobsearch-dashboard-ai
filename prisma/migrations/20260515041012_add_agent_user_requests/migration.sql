CREATE TYPE "AgentUserRequestType" AS ENUM ('UNKNOWN_ANSWER', 'APPLICATION_BLOCKED', 'EMAIL_REVIEW', 'INTERVIEW_PREP', 'APPROVAL_NEEDED', 'GENERAL');
CREATE TYPE "AgentUserRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED', 'RESOLVED');

CREATE TABLE "AgentUserRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agentRunId" TEXT,
  "applicationId" TEXT,
  "jobPostingId" TEXT,
  "type" "AgentUserRequestType" NOT NULL,
  "status" "AgentUserRequestStatus" NOT NULL DEFAULT 'OPEN',
  "question" TEXT NOT NULL,
  "contextJson" JSONB NOT NULL DEFAULT '{}',
  "answer" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentUserRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentUserRequest" ADD CONSTRAINT "AgentUserRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentUserRequest" ADD CONSTRAINT "AgentUserRequest_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentUserRequest" ADD CONSTRAINT "AgentUserRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentUserRequest" ADD CONSTRAINT "AgentUserRequest_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AgentUserRequest_userId_status_createdAt_idx" ON "AgentUserRequest"("userId", "status", "createdAt");
CREATE INDEX "AgentUserRequest_applicationId_status_idx" ON "AgentUserRequest"("applicationId", "status");
CREATE INDEX "AgentUserRequest_jobPostingId_status_idx" ON "AgentUserRequest"("jobPostingId", "status");
CREATE INDEX "AgentUserRequest_agentRunId_idx" ON "AgentUserRequest"("agentRunId");
