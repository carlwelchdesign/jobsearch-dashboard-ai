CREATE TABLE "ApplicationAutomationSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "autoSubmitEnabled" BOOLEAN NOT NULL DEFAULT false,
  "requireApprovedPacket" BOOLEAN NOT NULL DEFAULT true,
  "requireNoOpenUserRequests" BOOLEAN NOT NULL DEFAULT true,
  "requireFreshAssistantRun" BOOLEAN NOT NULL DEFAULT true,
  "maxRunAgeMinutes" INTEGER NOT NULL DEFAULT 30,
  "allowDemographicSubmission" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApplicationAutomationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationAutomationSettings_userId_key" ON "ApplicationAutomationSettings"("userId");

ALTER TABLE "ApplicationAutomationSettings" ADD CONSTRAINT "ApplicationAutomationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
