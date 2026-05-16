import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import SourceOutlinedIcon from "@mui/icons-material/SourceOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
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
  const companyAutomationPolicies = user
    ? await prisma.companyAutomationPolicy.findMany({
        where: { userId: user.id },
        orderBy: [{ autoSubmitMode: "asc" }, { company: "asc" }],
        select: {
          id: true,
          company: true,
          autoSubmitMode: true,
          notes: true,
        },
        take: 200,
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
  const emailOAuthConnections = user
    ? await prisma.emailOAuthConnection.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          provider: true,
          emailAddress: true,
          status: true,
          lastSyncAt: true,
          updatedAt: true,
        },
        orderBy: { provider: "asc" },
      })
    : [];
  const [skillFeedback, skillAdjustments] = user
    ? await Promise.all([
        prisma.skillFeedback.findMany({
          where: { userId: user.id },
          include: { adjustments: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.skillAdjustment.findMany({
          where: { userId: user.id },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 12,
        }),
      ])
    : [[], []];
  const nextAction = getSettingsNextAction({
    hasUser: Boolean(user),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    emailSyncConfigured: Boolean(process.env.JOB_EMAIL_IMAP_HOST && process.env.JOB_EMAIL_IMAP_USER && process.env.JOB_EMAIL_IMAP_PASSWORD),
    linkedinUrl: user?.profile?.linkedinUrl ?? "",
    githubRepositoryCount: user?.profile?.githubRepositories.length ?? 0,
    notificationSettings: {
      emailEnabled: settings?.emailEnabled ?? true,
      emailAddress: settings?.emailAddress ?? user?.email ?? "",
      pushoverEnabled: settings?.pushoverEnabled ?? false,
      pushoverUserKey: settings?.pushoverUserKey ?? "",
      pushoverAppToken: settings?.pushoverAppToken ?? "",
    },
    companySourceEnabled: companySource?.enabled ?? false,
    companyCount: Array.isArray(companySourceConfig?.companies) ? companySourceConfig.companies.length : 0,
    cronEnabled: searchProfiles.some((profile) => profile.enabled && profile.scheduleEnabled),
    automationEnabled: user?.automationSettings?.autoSubmitEnabled ?? false,
  });

  return (
    <AppShell>
      <Stack spacing={3} sx={{ maxWidth: 980 }}>
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          description="Configure email sync, notifications, scheduled search, profile links, company source discovery, and application automation policy."
        />
        <Card
          sx={{
            borderColor: nextAction.color === "warning" ? "warning.main" : nextAction.color === "success" ? "success.main" : "primary.main",
            bgcolor:
              nextAction.color === "warning"
                ? "rgba(245, 158, 11, 0.1)"
                : nextAction.color === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(37, 99, 235, 0.08)",
          }}
        >
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next setup action" />
                  <Chip size="small" variant="outlined" label={nextAction.scope} />
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  {nextAction.detail}
                </Typography>
              </Box>
              <ActionButton href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                {nextAction.label}
              </ActionButton>
            </Stack>
          </CardContent>
        </Card>
        <Card id="settings-skill-learning">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Skill learning" />
                  <Chip size="small" variant="outlined" label={`${skillAdjustments.filter((item) => item.status === "ACTIVE").length} active`} />
                  <Chip size="small" variant="outlined" label={`${skillAdjustments.filter((item) => item.status === "PROPOSED").length} pending`} />
                </Stack>
                <Typography variant="h3">Learning audit log</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Jolene records explicit mistake reports here. Low-risk threshold, warning, style, guidance, and QA updates can auto-apply; higher-risk changes stay proposed.
                </Typography>
              </Box>
              {skillAdjustments.length ? (
                <Stack spacing={1.25}>
                  {skillAdjustments.map((adjustment) => (
                    <Box key={adjustment.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                        <Chip size="small" label={adjustment.skillId.replace(/_/g, " ")} />
                        <Chip size="small" variant="outlined" label={adjustment.kind.toLowerCase().replace(/_/g, " ")} />
                        <Chip size="small" color={adjustment.status === "ACTIVE" ? "success" : adjustment.status === "PROPOSED" ? "warning" : "default"} label={adjustment.status.toLowerCase()} />
                        <Chip size="small" variant="outlined" label={adjustment.riskLevel.toLowerCase()} />
                      </Stack>
                      <Typography variant="body2">{adjustment.rationale}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {adjustment.appliedAt ? `Applied ${adjustment.appliedAt.toLocaleString()}` : `Created ${adjustment.createdAt.toLocaleString()}`}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No skill learning updates have been recorded yet.</Typography>
              )}
              {skillFeedback.length ? (
                <Box>
                  <Typography variant="h4" sx={{ mb: 1 }}>Recent mistake reports</Typography>
                  <Stack spacing={1}>
                    {skillFeedback.map((feedback) => (
                      <Box key={feedback.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                        <Typography variant="body2">{feedback.problemSummary}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {feedback.skillId.replace(/_/g, " ")} · {feedback.createdAt.toLocaleString()} · {feedback.adjustments.length} adjustment{feedback.adjustments.length === 1 ? "" : "s"}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
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
            gmailConfigured: Boolean(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET),
            outlookConfigured: Boolean(process.env.OUTLOOK_OAUTH_CLIENT_ID && process.env.OUTLOOK_OAUTH_CLIENT_SECRET),
            gmailMissing: missingEnv(["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET"]),
            outlookMissing: missingEnv(["OUTLOOK_OAUTH_CLIENT_ID", "OUTLOOK_OAUTH_CLIENT_SECRET"]),
            gmailCallbackUrl: process.env.GMAIL_OAUTH_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/email/oauth/gmail/callback`,
            outlookCallbackUrl: process.env.OUTLOOK_OAUTH_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/email/oauth/outlook/callback`,
            oauthConnections: emailOAuthConnections.map((connection) => ({
              id: connection.id,
              provider: connection.provider,
              emailAddress: connection.emailAddress,
              status: connection.status,
              lastSyncAt: connection.lastSyncAt?.toLocaleString() ?? null,
              updatedAt: connection.updatedAt.toLocaleString(),
            })),
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
          companyAutomationPolicies={companyAutomationPolicies}
        />
      </Stack>
    </AppShell>
  );
}

type SettingsNextActionInput = {
  hasUser: boolean;
  aiConfigured: boolean;
  emailSyncConfigured: boolean;
  linkedinUrl: string;
  githubRepositoryCount: number;
  notificationSettings: {
    emailEnabled: boolean;
    emailAddress: string;
    pushoverEnabled: boolean;
    pushoverUserKey: string;
    pushoverAppToken: string;
  };
  companySourceEnabled: boolean;
  companyCount: number;
  cronEnabled: boolean;
  automationEnabled: boolean;
};

function getSettingsNextAction(input: SettingsNextActionInput) {
  if (!input.hasUser) {
    return {
      title: "Create the base user profile",
      detail: "Settings depend on the first local user record. Add or import a profile before tuning automation.",
      label: "Open profile",
      href: "/resumes/profile",
      color: "warning" as const,
      icon: <SettingsSuggestOutlinedIcon />,
      scope: "required",
    };
  }

  if (!input.aiConfigured) {
    return {
      title: "Connect the AI provider",
      detail: "Resume parsing, job scoring, packet generation, QA, and interview prep need OPENAI_API_KEY before the system can run hands-off.",
      label: "View AI settings",
      href: "#settings-ai",
      color: "warning" as const,
      icon: <AutoAwesomeOutlinedIcon />,
      scope: "required",
    };
  }

  if (!input.linkedinUrl) {
    return {
      title: "Add application profile links",
      detail: "The local assistant needs your LinkedIn URL and profile links to fill employer forms without stopping for basic identity fields.",
      label: "Add links",
      href: "#settings-profile-links",
      color: "primary" as const,
      icon: <LinkOutlinedIcon />,
      scope: "assistant setup",
    };
  }

  if (input.githubRepositoryCount === 0) {
    return {
      title: "Sync GitHub work context",
      detail: "Project evidence helps agents position this app, Progression Lab AI, WebAuthn Core, and visualization work for stronger role matches.",
      label: "Sync GitHub",
      href: "#settings-github",
      color: "primary" as const,
      icon: <GitHubIcon />,
      scope: "evidence",
    };
  }

  const notificationMissing =
    (input.notificationSettings.emailEnabled && !input.notificationSettings.emailAddress) ||
    (input.notificationSettings.pushoverEnabled && (!input.notificationSettings.pushoverUserKey || !input.notificationSettings.pushoverAppToken));

  if (notificationMissing) {
    return {
      title: "Finish notification routing",
      detail: "Needs Me questions and application blockers should reach you outside the page, especially when the assistant gets stuck mid-application.",
      label: "Fix notifications",
      href: "#settings-notifications",
      color: "warning" as const,
      icon: <NotificationsActiveOutlinedIcon />,
      scope: "required",
    };
  }

  if (!input.companySourceEnabled || input.companyCount === 0) {
    return {
      title: "Enable company-source discovery",
      detail: "Career-page and ATS discovery gives the app better-fit roles than job board scraping alone.",
      label: "Review sources",
      href: "#settings-company-sources",
      color: "primary" as const,
      icon: <SourceOutlinedIcon />,
      scope: "job discovery",
    };
  }

  if (!input.cronEnabled) {
    return {
      title: "Turn on scheduled searches",
      detail: "Scheduled searches keep the review queue fresh without requiring you to manually start discovery each day.",
      label: "Configure schedule",
      href: "#settings-cron",
      color: "primary" as const,
      icon: <ScheduleOutlinedIcon />,
      scope: "automation",
    };
  }

  if (!input.emailSyncConfigured) {
    return {
      title: "Connect inbound email sync",
      detail: "Email sync lets the system detect rejections, recruiter replies, interview requests, and follow-up needs automatically.",
      label: "View email sync",
      href: "#settings-email-sync",
      color: "primary" as const,
      icon: <NotificationsActiveOutlinedIcon />,
      scope: "outcomes",
    };
  }

  return {
    title: input.automationEnabled ? "Review automation gates" : "Decide how hands-off applications should be",
    detail: input.automationEnabled
      ? "Auto-submit remains gated by approved packets, no open Needs Me items, fresh assistant state, and page safety checks."
      : "The assistant can fill forms and stop for review. Enable gated auto-submit only when you are comfortable with the guardrails.",
    label: "Review automation",
    href: "#settings-automation",
    color: input.automationEnabled ? "success" as const : "primary" as const,
    icon: <SettingsSuggestOutlinedIcon />,
    scope: "application flow",
  };
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

function missingEnv(names: string[]) {
  return names.filter((name) => !process.env[name]?.trim());
}
