export const metadata = {
  title: "Resume Profile | Job Search OS",
  description: "Edit the candidate profile used for generated application materials.",
};

import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { AppShell } from "@/app/app-shell";
import { prisma } from "@/lib/prisma";
import { parseResumeExperienceContext } from "@/lib/resumes/resume-context";
import { ResumeProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ResumeProfilePage() {
  const profile = await prisma.userProfile.findFirst({
    include: {
      experienceBullets: {
        orderBy: { createdAt: "desc" },
      },
      workExperiences: {
        orderBy: [{ isCurrent: "desc" }, { updatedAt: "desc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell>
      <Stack spacing={3} sx={{ maxWidth: 980 }}>
        {!profile ? (
          <Alert severity="info">No candidate profile exists yet. Upload and approve a resume first.</Alert>
        ) : (
          <ResumeProfileClient
            profile={{
              id: profile.id,
              fullName: profile.fullName,
              email: profile.email,
              professionalSummary: profile.professionalSummary,
            }}
            bullets={profile.experienceBullets.map((bullet) => ({
              id: bullet.id,
              workExperienceId: bullet.workExperienceId,
              company: bullet.company,
              role: bullet.role,
              category: bullet.category,
              text: bullet.text,
              keywords: Array.isArray(bullet.keywords) ? bullet.keywords.filter((keyword): keyword is string => typeof keyword === "string") : [],
              sourceText: bullet.sourceText,
              truthLevel: bullet.truthLevel,
              sourceResumeUploadId: bullet.sourceResumeUploadId,
              createdAt: bullet.createdAt.toISOString(),
              updatedAt: bullet.updatedAt.toISOString(),
            }))}
            workExperiences={profile.workExperiences.map((work) => ({
              id: work.id,
              company: work.company,
              title: work.title,
              location: work.location,
              startDate: work.startDate,
              endDate: work.endDate,
              isCurrent: work.isCurrent,
              summary: work.summary,
              skills: Array.isArray(work.skills) ? work.skills.filter((skill): skill is string => typeof skill === "string") : [],
              achievements: Array.isArray(work.achievements) ? work.achievements.filter((achievement): achievement is string => typeof achievement === "string") : [],
              sourceResumeUploadId: work.sourceResumeUploadId,
              resumeContext: parseResumeExperienceContext(work.resumeContext),
              createdAt: work.createdAt.toISOString(),
              updatedAt: work.updatedAt.toISOString(),
            }))}
          />
        )}
      </Stack>
    </AppShell>
  );
}
