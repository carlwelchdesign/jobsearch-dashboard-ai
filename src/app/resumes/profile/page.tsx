export const metadata = {
  title: "Resume Profile | Job Search OS",
  description: "Edit the candidate profile used for generated application materials.",
};

import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { AppShell } from "@/app/app-shell";
import { prisma } from "@/lib/prisma";
import { ResumeProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ResumeProfilePage() {
  const profile = await prisma.userProfile.findFirst({
    include: {
      experienceBullets: {
        orderBy: { createdAt: "desc" },
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
              company: bullet.company,
              role: bullet.role,
              category: bullet.category,
              text: bullet.text,
              keywords: Array.isArray(bullet.keywords) ? bullet.keywords.filter((keyword): keyword is string => typeof keyword === "string") : [],
              sourceText: bullet.sourceText,
              truthLevel: bullet.truthLevel,
            }))}
          />
        )}
      </Stack>
    </AppShell>
  );
}
