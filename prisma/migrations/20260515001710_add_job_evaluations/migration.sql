-- CreateEnum
CREATE TYPE "JobRecommendedAction" AS ENUM ('APPLY_NOW', 'MAYBE_APPLY', 'SAVE_FOR_LATER', 'REJECT', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "JobEvaluation" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "jobSearchProfileId" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "recommendedAction" "JobRecommendedAction" NOT NULL,
    "recommendedResumeProfile" TEXT,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "missingKeywords" JSONB NOT NULL DEFAULT '[]',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobEvaluation_recommendedAction_fitScore_idx" ON "JobEvaluation"("recommendedAction", "fitScore");

-- CreateIndex
CREATE INDEX "JobEvaluation_jobSearchProfileId_opportunityScore_idx" ON "JobEvaluation"("jobSearchProfileId", "opportunityScore");

-- CreateIndex
CREATE UNIQUE INDEX "JobEvaluation_jobPostingId_jobSearchProfileId_key" ON "JobEvaluation"("jobPostingId", "jobSearchProfileId");

-- AddForeignKey
ALTER TABLE "JobEvaluation" ADD CONSTRAINT "JobEvaluation_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvaluation" ADD CONSTRAINT "JobEvaluation_jobSearchProfileId_fkey" FOREIGN KEY ("jobSearchProfileId") REFERENCES "JobSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
