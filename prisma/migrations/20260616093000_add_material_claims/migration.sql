-- CreateEnum
CREATE TYPE "MaterialClaimArtifactType" AS ENUM ('GENERATED_RESUME', 'GENERATED_COVER_LETTER', 'APPLICATION_PACKET', 'LINKEDIN_POST_DRAFT', 'APPLICATION_ANSWER');

-- CreateEnum
CREATE TYPE "MaterialClaimStatus" AS ENUM ('SUPPORTED', 'NEEDS_REVIEW', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "MaterialClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artifactType" "MaterialClaimArtifactType" NOT NULL,
    "artifactId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MaterialClaimStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceEvidenceIds" JSONB NOT NULL DEFAULT '[]',
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "reviewJson" JSONB NOT NULL DEFAULT '{}',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialClaim_userId_status_createdAt_idx" ON "MaterialClaim"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialClaim_artifactType_artifactId_idx" ON "MaterialClaim"("artifactType", "artifactId");

-- CreateIndex
CREATE INDEX "MaterialClaim_agentRunId_idx" ON "MaterialClaim"("agentRunId");

-- AddForeignKey
ALTER TABLE "MaterialClaim" ADD CONSTRAINT "MaterialClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialClaim" ADD CONSTRAINT "MaterialClaim_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
