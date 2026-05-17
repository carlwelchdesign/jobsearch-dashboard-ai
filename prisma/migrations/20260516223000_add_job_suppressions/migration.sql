-- CreateEnum
CREATE TYPE "JobSuppressionKind" AS ENUM ('REJECTED_JOB', 'SUBMITTED_JOB', 'ARCHIVED_JOB', 'COMPANY_COOLDOWN');

-- CreateTable
CREATE TABLE "JobSuppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "JobSuppressionKind" NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "titleFamilyKey" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "jobPostingId" TEXT,
    "jobProfileMatchId" TEXT,
    "applicationId" TEXT,
    "duplicateGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSuppression_userId_kind_canonicalKey_key" ON "JobSuppression"("userId", "kind", "canonicalKey");

-- CreateIndex
CREATE INDEX "JobSuppression_userId_kind_expiresAt_idx" ON "JobSuppression"("userId", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "JobSuppression_userId_companyKey_titleFamilyKey_idx" ON "JobSuppression"("userId", "companyKey", "titleFamilyKey");

-- CreateIndex
CREATE INDEX "JobSuppression_jobPostingId_idx" ON "JobSuppression"("jobPostingId");

-- CreateIndex
CREATE INDEX "JobSuppression_jobProfileMatchId_idx" ON "JobSuppression"("jobProfileMatchId");

-- CreateIndex
CREATE INDEX "JobSuppression_applicationId_idx" ON "JobSuppression"("applicationId");

-- CreateIndex
CREATE INDEX "JobSuppression_duplicateGroupId_idx" ON "JobSuppression"("duplicateGroupId");

-- AddForeignKey
ALTER TABLE "JobSuppression" ADD CONSTRAINT "JobSuppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSuppression" ADD CONSTRAINT "JobSuppression_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSuppression" ADD CONSTRAINT "JobSuppression_jobProfileMatchId_fkey" FOREIGN KEY ("jobProfileMatchId") REFERENCES "JobProfileMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSuppression" ADD CONSTRAINT "JobSuppression_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
