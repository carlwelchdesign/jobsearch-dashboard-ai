-- Extend LinkedIn content drafts with review, provenance, and publishing state.
ALTER TABLE "LinkedInPostDraft"
  ADD COLUMN "disclosureText" TEXT,
  ADD COLUMN "memorySources" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "analyticsSources" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "agentReviews" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "claims" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "risks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "selectedScreenshots" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "linkedInPostUrn" TEXT,
  ADD COLUMN "linkedInPostId" TEXT,
  ADD COLUMN "publishError" TEXT,
  ADD COLUMN "publishPayload" JSONB NOT NULL DEFAULT '{}';

-- Store LinkedIn write-scope OAuth state separately from identity-only OIDC.
CREATE TABLE "LinkedInShareConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "linkedinSubject" TEXT,
  "personUrn" TEXT,
  "accessToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPublishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LinkedInShareConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LinkedInShareConnection_userId_key" ON "LinkedInShareConnection"("userId");
CREATE INDEX "LinkedInShareConnection_status_updatedAt_idx" ON "LinkedInShareConnection"("status", "updatedAt");

ALTER TABLE "LinkedInShareConnection"
  ADD CONSTRAINT "LinkedInShareConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
