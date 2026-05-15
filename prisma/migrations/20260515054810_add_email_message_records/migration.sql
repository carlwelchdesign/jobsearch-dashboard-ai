CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'outlook', 'imap', 'manual');
CREATE TYPE "EmailMessageClassification" AS ENUM ('REJECTION', 'RECRUITER_RESPONSE', 'INTERVIEW_REQUEST', 'CODING_ASSESSMENT', 'TAKE_HOME', 'SCHEDULING_REQUEST', 'OFFER', 'AUTOMATED_CONFIRMATION', 'NO_ACTION', 'UNRELATED', 'NEEDS_REVIEW');

CREATE TABLE "EmailMessageRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "threadId" TEXT,
  "from" TEXT NOT NULL,
  "to" JSONB NOT NULL DEFAULT '[]',
  "subject" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "snippet" TEXT NOT NULL,
  "bodyText" TEXT,
  "classification" "EmailMessageClassification" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "matchedApplicationId" TEXT,
  "matchedJobPostingId" TEXT,
  "actionRequired" BOOLEAN NOT NULL DEFAULT false,
  "rawMetadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailMessageRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailMessageRecord" ADD CONSTRAINT "EmailMessageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessageRecord" ADD CONSTRAINT "EmailMessageRecord_matchedApplicationId_fkey" FOREIGN KEY ("matchedApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessageRecord" ADD CONSTRAINT "EmailMessageRecord_matchedJobPostingId_fkey" FOREIGN KEY ("matchedJobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "EmailMessageRecord_userId_provider_providerMessageId_key" ON "EmailMessageRecord"("userId", "provider", "providerMessageId");
CREATE INDEX "EmailMessageRecord_userId_classification_receivedAt_idx" ON "EmailMessageRecord"("userId", "classification", "receivedAt");
CREATE INDEX "EmailMessageRecord_matchedApplicationId_receivedAt_idx" ON "EmailMessageRecord"("matchedApplicationId", "receivedAt");
CREATE INDEX "EmailMessageRecord_matchedJobPostingId_receivedAt_idx" ON "EmailMessageRecord"("matchedJobPostingId", "receivedAt");
