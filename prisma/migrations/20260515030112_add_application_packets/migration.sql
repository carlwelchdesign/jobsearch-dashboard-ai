-- CreateEnum
CREATE TYPE "ApplicationPacketStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'SUBMITTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ApplicationPacket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "resumeProfileId" TEXT,
    "generatedResumeId" TEXT,
    "generatedCoverLetterId" TEXT,
    "tailoredResumeContent" TEXT,
    "coverLetterContent" TEXT,
    "applicationAnswersJson" JSONB NOT NULL DEFAULT '{}',
    "recruiterMessage" TEXT,
    "hiringManagerMessage" TEXT,
    "companyBrief" TEXT,
    "projectLinks" JSONB NOT NULL DEFAULT '[]',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "qualityReviewJson" JSONB NOT NULL DEFAULT '{}',
    "status" "ApplicationPacketStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationPacket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationPacket_userId_status_idx" ON "ApplicationPacket"("userId", "status");

-- CreateIndex
CREATE INDEX "ApplicationPacket_jobPostingId_idx" ON "ApplicationPacket"("jobPostingId");

-- CreateIndex
CREATE INDEX "ApplicationPacket_resumeProfileId_idx" ON "ApplicationPacket"("resumeProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationPacket_applicationId_key" ON "ApplicationPacket"("applicationId");

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_generatedCoverLetterId_fkey" FOREIGN KEY ("generatedCoverLetterId") REFERENCES "GeneratedCoverLetter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_generatedResumeId_fkey" FOREIGN KEY ("generatedResumeId") REFERENCES "GeneratedResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_resumeProfileId_fkey" FOREIGN KEY ("resumeProfileId") REFERENCES "ResumeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPacket" ADD CONSTRAINT "ApplicationPacket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
