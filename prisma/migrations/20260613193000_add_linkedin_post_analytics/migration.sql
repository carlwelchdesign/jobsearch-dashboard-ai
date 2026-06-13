CREATE TABLE "LinkedInAnalyticsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedinSubject" TEXT,
    "personUrn" TEXT,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInAnalyticsConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LinkedInPostMetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedInPostDraftId" TEXT,
    "linkedInPostUrn" TEXT NOT NULL,
    "linkedInPostId" TEXT,
    "source" TEXT NOT NULL,
    "aggregation" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "membersReached" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "reshares" INTEGER NOT NULL DEFAULT 0,
    "postSaves" INTEGER NOT NULL DEFAULT 0,
    "postSends" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "premiumCtaClicks" INTEGER NOT NULL DEFAULT 0,
    "followersGainedFromContent" INTEGER NOT NULL DEFAULT 0,
    "profileViewsFromContent" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInPostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LinkedInAnalyticsConnection_userId_key" ON "LinkedInAnalyticsConnection"("userId");
CREATE INDEX "LinkedInAnalyticsConnection_status_updatedAt_idx" ON "LinkedInAnalyticsConnection"("status", "updatedAt");
CREATE UNIQUE INDEX "LinkedInPostMetricSnapshot_userId_linkedInPostUrn_source_aggregation_dateStart_dateEnd_key" ON "LinkedInPostMetricSnapshot"("userId", "linkedInPostUrn", "source", "aggregation", "dateStart", "dateEnd");
CREATE INDEX "LinkedInPostMetricSnapshot_userId_capturedAt_idx" ON "LinkedInPostMetricSnapshot"("userId", "capturedAt");
CREATE INDEX "LinkedInPostMetricSnapshot_linkedInPostDraftId_idx" ON "LinkedInPostMetricSnapshot"("linkedInPostDraftId");
CREATE INDEX "LinkedInPostMetricSnapshot_linkedInPostUrn_idx" ON "LinkedInPostMetricSnapshot"("linkedInPostUrn");

ALTER TABLE "LinkedInAnalyticsConnection" ADD CONSTRAINT "LinkedInAnalyticsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LinkedInPostMetricSnapshot" ADD CONSTRAINT "LinkedInPostMetricSnapshot_linkedInPostDraftId_fkey" FOREIGN KEY ("linkedInPostDraftId") REFERENCES "LinkedInPostDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LinkedInPostMetricSnapshot" ADD CONSTRAINT "LinkedInPostMetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
