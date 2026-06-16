-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'RECRUITING_SEARCH_DIRECTOR';
ALTER TYPE "AgentType" ADD VALUE 'SEARCH_YIELD_ANALYST';
ALTER TYPE "AgentType" ADD VALUE 'SEARCH_PROFILE_EDITOR';
ALTER TYPE "AgentType" ADD VALUE 'SOURCE_QUALITY_ANALYST';
ALTER TYPE "AgentType" ADD VALUE 'MATCH_CALIBRATION_REVIEWER';
ALTER TYPE "AgentType" ADD VALUE 'OUTCOME_RECRUITER';

-- CreateTable
CREATE TABLE "SearchOptimizationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'active',
    "targetMetric" TEXT NOT NULL DEFAULT 'QUALIFIED_YIELD',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "summary" TEXT NOT NULL,
    "metricsJson" JSONB NOT NULL DEFAULT '{}',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchOptimizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProfileChange" (
    "id" TEXT NOT NULL,
    "optimizationRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "searchProfileId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "fieldName" TEXT,
    "beforeJson" JSONB NOT NULL DEFAULT '{}',
    "afterJson" JSONB NOT NULL DEFAULT '{}',
    "rollbackJson" JSONB NOT NULL DEFAULT '{}',
    "rationale" TEXT NOT NULL,
    "expectedMetricsJson" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchProfileChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchOptimizationRun_userId_createdAt_idx" ON "SearchOptimizationRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchOptimizationRun_agentRunId_idx" ON "SearchOptimizationRun"("agentRunId");

-- CreateIndex
CREATE INDEX "SearchOptimizationRun_targetMetric_status_idx" ON "SearchOptimizationRun"("targetMetric", "status");

-- CreateIndex
CREATE INDEX "SearchProfileChange_userId_status_createdAt_idx" ON "SearchProfileChange"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SearchProfileChange_searchProfileId_createdAt_idx" ON "SearchProfileChange"("searchProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchProfileChange_optimizationRunId_idx" ON "SearchProfileChange"("optimizationRunId");

-- CreateIndex
CREATE INDEX "SearchProfileChange_agentRunId_idx" ON "SearchProfileChange"("agentRunId");

-- AddForeignKey
ALTER TABLE "SearchOptimizationRun" ADD CONSTRAINT "SearchOptimizationRun_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchOptimizationRun" ADD CONSTRAINT "SearchOptimizationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileChange" ADD CONSTRAINT "SearchProfileChange_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileChange" ADD CONSTRAINT "SearchProfileChange_optimizationRunId_fkey" FOREIGN KEY ("optimizationRunId") REFERENCES "SearchOptimizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileChange" ADD CONSTRAINT "SearchProfileChange_searchProfileId_fkey" FOREIGN KEY ("searchProfileId") REFERENCES "JobSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileChange" ADD CONSTRAINT "SearchProfileChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
