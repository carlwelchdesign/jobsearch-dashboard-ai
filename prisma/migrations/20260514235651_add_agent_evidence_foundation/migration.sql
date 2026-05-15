-- CreateEnum
CREATE TYPE "CandidateEvidenceType" AS ENUM ('EXPERIENCE', 'PROJECT', 'ACHIEVEMENT', 'SKILL', 'METRIC', 'EDUCATION', 'CERTIFICATION', 'PREFERENCE', 'WRITING_STYLE');

-- CreateEnum
CREATE TYPE "CandidateEvidenceSourceType" AS ENUM ('RESUME_UPLOAD', 'USER_INPUT', 'GITHUB_REPO', 'LINKEDIN', 'APPLICATION_HISTORY', 'INTERVIEW_NOTE', 'GENERATED_BUT_APPROVED');

-- CreateEnum
CREATE TYPE "EvidenceConfidence" AS ENUM ('VERIFIED', 'INFERRED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('CANDIDATE_INTELLIGENCE', 'RESUME_STRATEGY', 'COVER_LETTER_WRITER', 'JOB_FIT_SCORER', 'SEARCH_PROFILE_MANAGER', 'RECRUITER_INTELLIGENCE', 'PORTFOLIO_MATCH', 'GITHUB_PORTFOLIO_REVIEW', 'APPLICATION_QA', 'INTERVIEW_PREP', 'OUTCOME_LEARNING', 'COMPENSATION_OPPORTUNITY', 'NETWORKING_STRATEGY', 'COMPANY_RESEARCH', 'ANTI_GENERIC_WRITING', 'DUPLICATE_STALE_JOB_DETECTOR', 'SEARCH_EXPANSION', 'DAILY_COMMAND_CENTER');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "CandidateEvidence" (
    "id" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "type" "CandidateEvidenceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceType" "CandidateEvidenceSourceType" NOT NULL,
    "sourceRef" TEXT,
    "confidence" "EvidenceConfidence" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "usableInResume" BOOLEAN NOT NULL DEFAULT false,
    "usableInCoverLetter" BOOLEAN NOT NULL DEFAULT false,
    "usableInRecruiterMessage" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "inputJson" JSONB NOT NULL,
    "outputJson" JSONB,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateEvidence_candidateProfileId_confidence_idx" ON "CandidateEvidence"("candidateProfileId", "confidence");

-- CreateIndex
CREATE INDEX "CandidateEvidence_candidateProfileId_type_idx" ON "CandidateEvidence"("candidateProfileId", "type");

-- CreateIndex
CREATE INDEX "CandidateEvidence_sourceType_sourceRef_idx" ON "CandidateEvidence"("sourceType", "sourceRef");

-- CreateIndex
CREATE INDEX "AgentRun_agentType_createdAt_idx" ON "AgentRun"("agentType", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
