-- AlterTable
ALTER TABLE "ApplicationAutomationRun" ADD COLUMN     "currentNode" TEXT,
ADD COLUMN     "graphThreadId" TEXT,
ADD COLUMN     "workflowStateJson" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "ApplicationAutomationRun_graphThreadId_idx" ON "ApplicationAutomationRun"("graphThreadId");
