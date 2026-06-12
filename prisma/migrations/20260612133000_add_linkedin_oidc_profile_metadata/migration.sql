ALTER TABLE "UserProfile" ADD COLUMN "linkedinSubject" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "linkedinPictureUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "linkedinLocale" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "linkedinEmailVerified" BOOLEAN;
ALTER TABLE "UserProfile" ADD COLUMN "linkedinConnectedAt" TIMESTAMP(3);
