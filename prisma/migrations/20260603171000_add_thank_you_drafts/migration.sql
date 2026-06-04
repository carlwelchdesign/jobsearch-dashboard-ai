CREATE TABLE "ThankYouDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "interviewerName" TEXT NOT NULL,
    "interviewerTitle" TEXT,
    "interviewerCompany" TEXT,
    "interviewerLinkedin" TEXT,
    "interviewDate" TIMESTAMP(3),
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "notes" TEXT,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "linkedinBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "qualityReview" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThankYouDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ThankYouDraft_applicationId_createdAt_idx" ON "ThankYouDraft"("applicationId", "createdAt");
CREATE INDEX "ThankYouDraft_userId_status_idx" ON "ThankYouDraft"("userId", "status");
CREATE INDEX "ThankYouDraft_jobPostingId_createdAt_idx" ON "ThankYouDraft"("jobPostingId", "createdAt");

ALTER TABLE "ThankYouDraft" ADD CONSTRAINT "ThankYouDraft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThankYouDraft" ADD CONSTRAINT "ThankYouDraft_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThankYouDraft" ADD CONSTRAINT "ThankYouDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
