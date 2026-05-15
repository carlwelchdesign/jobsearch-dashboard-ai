-- CreateTable
CREATE TABLE "SearchProfilePerformance" (
    "id" TEXT NOT NULL,
    "searchProfileId" TEXT NOT NULL,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsApproved" INTEGER NOT NULL DEFAULT 0,
    "jobsRejected" INTEGER NOT NULL DEFAULT 0,
    "applicationsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "recruiterScreens" INTEGER NOT NULL DEFAULT 0,
    "interviews" INTEGER NOT NULL DEFAULT 0,
    "offers" INTEGER NOT NULL DEFAULT 0,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "noResponseCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateRate" INTEGER NOT NULL DEFAULT 0,
    "averageFitScore" INTEGER NOT NULL DEFAULT 0,
    "averageOpportunityScore" INTEGER NOT NULL DEFAULT 0,
    "callbackRate" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProfilePerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchProfilePerformance_searchProfileId_lastEvaluatedAt_idx" ON "SearchProfilePerformance"("searchProfileId", "lastEvaluatedAt");

-- AddForeignKey
ALTER TABLE "SearchProfilePerformance" ADD CONSTRAINT "SearchProfilePerformance_searchProfileId_fkey" FOREIGN KEY ("searchProfileId") REFERENCES "JobSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
