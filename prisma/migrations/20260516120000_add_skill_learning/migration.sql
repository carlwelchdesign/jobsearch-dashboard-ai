CREATE TYPE "SkillAdjustmentKind" AS ENUM ('THRESHOLD', 'WARNING', 'STYLE_RULE', 'GUIDANCE', 'QA_CHECK', 'SCORING_WEIGHT', 'ACTION_POLICY');

CREATE TYPE "SkillAdjustmentRiskLevel" AS ENUM ('LOW', 'HIGH');

CREATE TYPE "SkillAdjustmentStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

CREATE TABLE "SkillFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "applicationId" TEXT,
    "jobPostingId" TEXT,
    "joleneMessageId" TEXT,
    "rawMessage" TEXT NOT NULL,
    "problemSummary" TEXT NOT NULL,
    "expectedBehavior" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "contextJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "feedbackId" TEXT,
    "supersedesId" TEXT,
    "kind" "SkillAdjustmentKind" NOT NULL,
    "riskLevel" "SkillAdjustmentRiskLevel" NOT NULL,
    "status" "SkillAdjustmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "patchJson" JSONB NOT NULL DEFAULT '{}',
    "rationale" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillFeedback_userId_createdAt_idx" ON "SkillFeedback"("userId", "createdAt");
CREATE INDEX "SkillFeedback_skillId_createdAt_idx" ON "SkillFeedback"("skillId", "createdAt");
CREATE INDEX "SkillFeedback_applicationId_createdAt_idx" ON "SkillFeedback"("applicationId", "createdAt");
CREATE INDEX "SkillFeedback_jobPostingId_createdAt_idx" ON "SkillFeedback"("jobPostingId", "createdAt");

CREATE INDEX "SkillAdjustment_userId_status_createdAt_idx" ON "SkillAdjustment"("userId", "status", "createdAt");
CREATE INDEX "SkillAdjustment_skillId_status_createdAt_idx" ON "SkillAdjustment"("skillId", "status", "createdAt");
CREATE INDEX "SkillAdjustment_feedbackId_idx" ON "SkillAdjustment"("feedbackId");
CREATE INDEX "SkillAdjustment_supersedesId_idx" ON "SkillAdjustment"("supersedesId");

ALTER TABLE "SkillFeedback" ADD CONSTRAINT "SkillFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillFeedback" ADD CONSTRAINT "SkillFeedback_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillFeedback" ADD CONSTRAINT "SkillFeedback_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillFeedback" ADD CONSTRAINT "SkillFeedback_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillFeedback" ADD CONSTRAINT "SkillFeedback_joleneMessageId_fkey" FOREIGN KEY ("joleneMessageId") REFERENCES "JoleneMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SkillAdjustment" ADD CONSTRAINT "SkillAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillAdjustment" ADD CONSTRAINT "SkillAdjustment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "SkillFeedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SkillAdjustment" ADD CONSTRAINT "SkillAdjustment_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "SkillAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
