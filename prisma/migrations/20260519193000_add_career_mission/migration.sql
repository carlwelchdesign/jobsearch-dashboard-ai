CREATE TABLE "CareerMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetCompensationMin" INTEGER,
    "targetCompensationIdeal" INTEGER,
    "currency" "SalaryCurrency" NOT NULL DEFAULT 'USD',
    "horizonDays" INTEGER NOT NULL DEFAULT 30,
    "urgencyMode" TEXT NOT NULL DEFAULT 'HIGH_INCOME_SPRINT',
    "tradeoffPolicy" TEXT NOT NULL DEFAULT 'AGGRESSIVE_BUT_TRUTHFUL',
    "roleTracks" JSONB NOT NULL DEFAULT '[]',
    "dealbreakers" JSONB NOT NULL DEFAULT '[]',
    "acceptableFallbacks" JSONB NOT NULL DEFAULT '[]',
    "dailyCapacityMinutes" INTEGER,
    "energyNotes" TEXT,
    "tonePreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerMission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareerMission_userId_key" ON "CareerMission"("userId");

ALTER TABLE "CareerMission" ADD CONSTRAINT "CareerMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
