-- CreateEnum
CREATE TYPE "ResumeProfileStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ResumeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetRoles" JSONB NOT NULL DEFAULT '[]',
    "positioningSummary" TEXT NOT NULL,
    "evidenceTags" JSONB NOT NULL DEFAULT '[]',
    "priorityProjects" JSONB NOT NULL DEFAULT '[]',
    "defaultSections" JSONB NOT NULL DEFAULT '[]',
    "status" "ResumeProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeProfile_userId_status_idx" ON "ResumeProfile"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeProfile_userId_name_key" ON "ResumeProfile"("userId", "name");

-- AddForeignKey
ALTER TABLE "ResumeProfile" ADD CONSTRAINT "ResumeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
