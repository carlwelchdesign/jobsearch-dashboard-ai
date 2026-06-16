-- Add reviewable recruiter-format resume context to work history rows.
ALTER TABLE "WorkExperience" ADD COLUMN IF NOT EXISTS "resumeContext" JSONB NOT NULL DEFAULT '{}';
