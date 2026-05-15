import Stack from "@mui/material/Stack";
import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await prisma.user.findFirst({
    include: { automationSettings: true, notificationSettings: true, profile: { include: { githubRepositories: true } } },
    orderBy: { createdAt: "asc" },
  });
  const searchProfiles = user
    ? await prisma.jobSearchProfile.findMany({
        where: { userId: user.id },
        orderBy: [{ enabled: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          enabled: true,
          scheduleEnabled: true,
          cronExpression: true,
        },
      })
    : [];
  const companySource = await prisma.jobSource.findUnique({
    where: { type_name: { type: "company_site", name: "Company Source List" } },
  });
  const companySourceConfig = companySource?.config as { companies?: unknown[]; priorityMax?: number; maxCompanies?: number; maxFetch?: number } | undefined;
  const settings = user?.notificationSettings;
  const cronExpression = searchProfiles.find((profile) => profile.cronExpression)?.cronExpression ?? "0 14 * * *";
  const latestGithubReviewRun = await prisma.agentRun.findFirst({
    where: {
      agentType: "GITHUB_PORTFOLIO_REVIEW",
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <Stack spacing={3} sx={{ maxWidth: 980 }}>
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          description="Configure notification defaults and profile data used by approved application workflows."
        />
        <SettingsClient
          initialSettings={{
            emailEnabled: settings?.emailEnabled ?? true,
            emailAddress: settings?.emailAddress ?? user?.email ?? "",
            pushoverEnabled: settings?.pushoverEnabled ?? false,
            pushoverUserKey: settings?.pushoverUserKey ?? "",
            pushoverAppToken: settings?.pushoverAppToken ?? "",
            minimumScoreForPush: settings?.minimumScoreForPush ?? 85,
            digestMode: settings?.digestMode ?? "strong_matches_only",
          }}
          aiSettings={{
            configured: Boolean(process.env.OPENAI_API_KEY),
            model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          }}
          emailSyncSettings={{
            configured: Boolean(process.env.JOB_EMAIL_IMAP_HOST && process.env.JOB_EMAIL_IMAP_USER && process.env.JOB_EMAIL_IMAP_PASSWORD),
            provider: "IMAP",
            mailbox: process.env.JOB_EMAIL_IMAP_MAILBOX ?? "INBOX",
            limit: Number(process.env.JOB_EMAIL_IMAP_LIMIT ?? 25),
            sinceDays: Number(process.env.JOB_EMAIL_IMAP_SINCE_DAYS ?? 14),
            endpoint: "/api/email/imap-sync",
            secretConfigured: Boolean(process.env.EMAIL_SYNC_SECRET),
          }}
          sourceSettings={{
            companySourceEnabled: companySource?.enabled ?? false,
            companyCount: Array.isArray(companySourceConfig?.companies) ? companySourceConfig.companies.length : 0,
            priorityMax: companySourceConfig?.priorityMax ?? 2,
            maxCompanies: companySourceConfig?.maxCompanies ?? 90,
            maxFetch: companySourceConfig?.maxFetch ?? 900,
          }}
          profileSettings={{
            linkedinUrl: user?.profile?.linkedinUrl ?? "",
            githubUrl: user?.profile?.githubUrl ?? "https://github.com/carlwelchdesign",
            raceAnswer: user?.profile?.raceAnswer ?? "",
            genderAnswer: user?.profile?.genderAnswer ?? "",
            veteranStatusAnswer: user?.profile?.veteranStatusAnswer ?? "",
            disabilityAnswer: user?.profile?.disabilityAnswer ?? "",
            githubRepositoryCount: user?.profile?.githubRepositories.length ?? 0,
            latestGithubSync: user?.profile?.githubRepositories
              .map((repo) => repo.updatedAt)
              .sort((a, b) => b.getTime() - a.getTime())[0]?.toLocaleString() ?? null,
          }}
          latestGithubReview={isRecord(latestGithubReviewRun?.outputJson) ? latestGithubReviewRun.outputJson as SettingsGithubReview : null}
          cronSettings={{
            enabled: searchProfiles.some((profile) => profile.enabled && profile.scheduleEnabled),
            cronExpression,
            scheduleLabel: "Daily at 14:00 UTC",
            endpoint: "/api/cron/job-search",
            cronSecretConfigured: Boolean(process.env.CRON_SECRET),
            profiles: searchProfiles,
          }}
          automationSettings={{
            autoSubmitEnabled: user?.automationSettings?.autoSubmitEnabled ?? false,
            requireApprovedPacket: user?.automationSettings?.requireApprovedPacket ?? true,
            requireNoOpenUserRequests: user?.automationSettings?.requireNoOpenUserRequests ?? true,
            requireFreshAssistantRun: user?.automationSettings?.requireFreshAssistantRun ?? true,
            maxRunAgeMinutes: user?.automationSettings?.maxRunAgeMinutes ?? 30,
            allowDemographicSubmission: user?.automationSettings?.allowDemographicSubmission ?? false,
          }}
        />
      </Stack>
    </AppShell>
  );
}

type SettingsGithubReview = {
  overallReadinessScore?: number;
  reviewedRepositoryCount?: number;
  priorityActions?: string[];
  warnings?: string[];
  repositoryReviews?: Array<{
    repositoryId: string;
    name: string;
    url: string;
    readinessScore: number;
    targetTracks: string[];
    gaps: string[];
    recommendedEdits: string[];
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
