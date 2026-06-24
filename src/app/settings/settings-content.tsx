import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import SourceOutlinedIcon from "@mui/icons-material/SourceOutlined";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/ui/page-header";
import { FieldMemoryActions } from "@/app/applications/field-learning/field-memory-actions";
import { FieldMemoryBulkActions } from "@/app/applications/field-learning/field-memory-bulk-actions";
import { getLocalAssistantAvailability } from "@/lib/applications/local-assistant-availability";
import { getLearningImpact } from "@/lib/observability/learning-impact";
import { getOutcomeCalibration, getOutcomeCalibrationTrends, getOutcomeRegressionTriage } from "@/lib/observability/outcome-calibration";
import { getLearningRollbackAudit } from "@/lib/observability/rollback-audit";
import { normalizeLinkedInScopes } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { normalizeResumeFormat } from "@/lib/resumes/resume-format";
import { DEFAULT_LINKEDIN_CONTENT_MODEL, DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL } from "@/lib/settings/ai-settings";
import { SettingsClient } from "./settings-client";
import type { ServiceHealthSettings, ServiceStatus } from "./service-health-panel";

export const dynamic = "force-dynamic";

export type SettingsRouteGroup = "overview" | "system" | "search" | "application" | "learning" | "admin";

type SettingsSearchParams = {
  highlight?: string;
  host?: string;
  applicationId?: string;
};

type FieldMemoryWithSource = Prisma.ApplicationFieldMemoryGetPayload<{
  include: {
    sourceApplication: {
      select: {
        id: true;
        jobPosting: { select: { company: true; title: true } };
      };
    };
  };
}>;

const SETTINGS_ROUTES: Array<{ href: string; label: string; description: string; group: Exclude<SettingsRouteGroup, "overview"> }> = [
  { href: "/settings/system", label: "System", description: "Service health, AI provider, email sync, and notifications.", group: "system" },
  { href: "/settings/search", label: "Search", description: "Scheduled search and company source discovery.", group: "search" },
  { href: "/settings/application", label: "Application", description: "Automation policy, repeated answers, profile links, and GitHub context.", group: "application" },
  { href: "/settings/learning", label: "Learning", description: "Agent quality, outcome calibration, learning impact, and memories.", group: "learning" },
  { href: "/settings/admin", label: "Admin", description: "Supporting tools that do not need primary navigation.", group: "admin" },
];

const SETTINGS_GROUP_COPY: Record<SettingsRouteGroup, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Preferences",
    title: "Settings",
    description: "Choose a focused settings area instead of scanning every configuration section at once.",
  },
  system: {
    eyebrow: "Settings",
    title: "System settings",
    description: "Configure service health, AI providers, email sync, and notifications.",
  },
  search: {
    eyebrow: "Settings",
    title: "Search settings",
    description: "Configure scheduled job search and company source discovery.",
  },
  application: {
    eyebrow: "Settings",
    title: "Application settings",
    description: "Configure application automation, repeated answers, profile links, and GitHub context.",
  },
  learning: {
    eyebrow: "Settings",
    title: "Learning settings",
    description: "Review agent quality, outcome calibration, learning impact, and field memory behavior.",
  },
  admin: {
    eyebrow: "Settings",
    title: "Admin settings",
    description: "Open supporting tools that no longer need primary navigation space.",
  },
};

export async function SettingsRouteContent({
  group = "overview",
  searchParams,
}: {
  group?: SettingsRouteGroup;
  searchParams?: SettingsSearchParams;
}) {
  const user = await prisma.user.findFirst({
    include: { aiSettings: true, automationSettings: true, notificationSettings: true, profile: { include: { githubRepositories: true } } },
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
  const linkedinShareConnection = user
    ? await prisma.linkedInShareConnection.findUnique({ where: { userId: user.id } })
    : null;
  const [skillFeedback, skillAdjustments, fieldMemories] = user && group === "learning"
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
        prisma.applicationFieldMemory.findMany({
          where: {
            userId: user.id,
            ...(searchParams?.host?.trim() ? { host: searchParams.host.trim() } : {}),
            ...(searchParams?.applicationId?.trim() ? { sourceApplicationId: searchParams.applicationId.trim() } : {}),
          },
          include: {
            sourceApplication: {
              select: {
                id: true,
                jobPosting: { select: { company: true, title: true } },
              },
            },
          },
          orderBy: [{ status: "desc" }, { lastSeenAt: "desc" }, { confidence: "desc" }],
          take: 250,
        }),
      ])
    : [[], [], []];
  const quality = user && group === "learning"
    ? await Promise.all([
        prisma.agentQualityExample.count({ where: { userId: user.id } }),
        prisma.agentQualityEvaluation.count({ where: { userId: user.id, status: "FAILED" } }),
        prisma.agentQualityEvaluation.aggregate({
          where: { userId: user.id },
          _avg: { score: true },
        }),
        prisma.agentImprovementProposal.findMany({
          where: { userId: user.id },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 8,
        }),
        prisma.agentQualityEvaluation.groupBy({
          by: ["target"],
          where: { userId: user.id },
          _count: { target: true },
          _avg: { score: true },
        }),
      ])
    : [0, 0, { _avg: { score: null } }, [], []] as const;
  const [qualityExampleCount, qualityFailedCount, qualityScore, qualityProposals, qualityByTarget] = quality;
  const outcomeCalibration = user && group === "learning" ? await getOutcomeCalibration(user.id) : null;
  const outcomeTrends = user && group === "learning" ? await getOutcomeCalibrationTrends(user.id) : null;
  const outcomeRegressionTriage = user && group === "learning" ? await getOutcomeRegressionTriage(user.id) : [];
  const learningImpact = user && group === "learning" ? await getLearningImpact(user.id) : [];
  const rollbackAudit = user && group === "learning" ? await getLearningRollbackAudit(user.id) : [];
  const imapConfigured = Boolean(process.env.JOB_EMAIL_IMAP_HOST && process.env.JOB_EMAIL_IMAP_USER && process.env.JOB_EMAIL_IMAP_PASSWORD);
  const emailSyncSecretConfigured = Boolean(process.env.EMAIL_SYNC_SECRET);
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  const pushoverEnvConfigured = Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_APP_TOKEN);
  const pushoverDbConfigured = Boolean(settings?.pushoverUserKey && settings?.pushoverAppToken);
  const cronEnabled = searchProfiles.some((profile) => profile.enabled && profile.scheduleEnabled);
  const latestGithubSyncDate = latestDate(user?.profile?.githubRepositories.map((repo) => repo.updatedAt) ?? []);
  const githubRepoCount = user?.profile?.githubRepositories.length ?? 0;
  const localAssistant = getLocalAssistantAvailability();

  const serviceStatuses: Record<string, ServiceStatus> = {
    openai: process.env.OPENAI_API_KEY ? "active" : "not_configured",
    langsmith:
      process.env.LANGSMITH_TRACING === "true" && Boolean(process.env.LANGSMITH_API_KEY)
        ? "active"
        : "not_configured",
    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY) ? "active" : "not_configured",
    resend: Boolean(process.env.RESEND_API_KEY) ? "active" : "not_configured",
    postmark: Boolean(process.env.POSTMARK_SERVER_TOKEN) ? "active" : "not_configured",
    pushover: pushoverEnvConfigured || pushoverDbConfigured ? "active" : "not_configured",
    imap: imapConfigured
      ? emailSyncSecretConfigured
        ? "active"
        : "warning"
      : "not_configured",
    gmail: Boolean(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET)
      ? "active"
      : "not_configured",
    outlook: Boolean(process.env.OUTLOOK_OAUTH_CLIENT_ID && process.env.OUTLOOK_OAUTH_CLIENT_SECRET)
      ? "active"
      : "not_configured",
    github_token: Boolean(process.env.GITHUB_TOKEN) ? "active" : "not_configured",
    cron_secret: cronSecretConfigured
      ? "active"
      : cronEnabled
      ? "warning"
      : "not_configured",
    extension_token: Boolean(process.env.BROWSER_EXTENSION_TOKEN) ? "active" : "not_configured",
    adk: process.env.ADK_ENABLED === "true" ? "active" : "not_configured",
    redis: Boolean(process.env.REDIS_URL) ? "active" : "not_configured",
    playwright: localAssistant.available ? "active" : "not_configured",
  };

  const inferredSilentFailures: Array<{ service: string; message: string }> = [];

  for (const conn of emailOAuthConnections) {
    if (conn.status !== "CONNECTED") {
      inferredSilentFailures.push({
        service: conn.provider === "gmail" ? "Gmail OAuth" : "Outlook OAuth",
        message: `OAuth connection status is ${conn.status.toLowerCase()} — reconnect to restore email sync`,
      });
    }
  }

  if (imapConfigured && !emailSyncSecretConfigured) {
    inferredSilentFailures.push({
      service: "IMAP",
      message: "EMAIL_SYNC_SECRET is not set — the IMAP sync endpoint accepts unauthenticated requests",
    });
  }

  if (cronEnabled && !cronSecretConfigured) {
    inferredSilentFailures.push({
      service: "Vercel Cron",
      message: "CRON_SECRET is not set — Vercel cannot authenticate scheduled search runs",
    });
  }

  if (githubRepoCount > 0 && latestGithubSyncDate) {
    const daysSinceSync = Math.floor((Date.now() - latestGithubSyncDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceSync > 30) {
      inferredSilentFailures.push({
        service: "GitHub",
        message: `Repository context last synced ${daysSinceSync} days ago — re-sync to keep resume context fresh`,
      });
    }
  }

  if (settings?.emailEnabled && !process.env.RESEND_API_KEY && !process.env.POSTMARK_SERVER_TOKEN) {
    inferredSilentFailures.push({
      service: "Email notifications",
      message: "Email notifications are enabled in settings but neither RESEND_API_KEY nor POSTMARK_SERVER_TOKEN is configured",
    });
  }

  if (settings?.pushoverEnabled && !pushoverEnvConfigured && !pushoverDbConfigured) {
    inferredSilentFailures.push({
      service: "Pushover",
      message: "Pushover notifications are enabled but no credentials are configured",
    });
  }

  const serviceHealthSettings: ServiceHealthSettings = {
    statuses: serviceStatuses,
    silentFailures: inferredSilentFailures,
    highlight: searchParams?.highlight,
  };

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
          eyebrow={SETTINGS_GROUP_COPY[group].eyebrow}
          title={SETTINGS_GROUP_COPY[group].title}
          description={SETTINGS_GROUP_COPY[group].description}
        />
        {group === "overview" ? <SettingsOverview nextAction={nextAction} /> : <SettingsRouteNav activeGroup={group} />}
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
        {group === "learning" ? (
          <>
        <Card id="settings-agent-quality">
          <CardContent>
            <Stack spacing={2} id="settings-quality-proposals">
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Agent quality" />
                  <Chip size="small" variant="outlined" label={`${qualityExampleCount} examples`} />
                  <Chip size="small" color={qualityFailedCount ? "warning" : "success"} variant="outlined" label={`${qualityFailedCount} failed evals`} />
                  <Chip size="small" variant="outlined" label={qualityScore._avg.score === null ? "not scored" : `${Math.round(qualityScore._avg.score)} avg`} />
                </Stack>
                <Typography variant="h3">Cross-agent evaluation loop</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Assistant failures, agency run repairs, noisy search runs, and rejected high-score matches become redacted quality examples. Evaluations score recurring behavior and create propose-only improvements for review.
                </Typography>
              </Box>
              {qualityByTarget.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {qualityByTarget.map((item) => (
                    <Chip
                      key={item.target}
                      size="small"
                      variant="outlined"
                      label={`${item.target.toLowerCase().replace(/_/g, " ")}: ${item._count.target} evals${item._avg.score === null ? "" : `, ${Math.round(item._avg.score)} avg`}`}
                    />
                  ))}
                </Stack>
              ) : null}
              {qualityProposals.length ? (
                <Stack spacing={1.25}>
                  {qualityProposals.map((proposal) => {
                    const activation = proposalActivationLabel(proposal);
                    return (
                      <Box key={proposal.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                          <Chip size="small" color="info" variant="outlined" label={proposal.target.toLowerCase().replace(/_/g, " ")} />
                          <Chip size="small" label={proposal.type.toLowerCase()} />
                          <Chip size="small" color={proposal.status === "PROPOSED" ? "warning" : proposal.status === "ACCEPTED" ? "success" : "default"} label={proposal.status.toLowerCase()} />
                          <Chip size="small" variant="outlined" label={proposal.riskLevel.toLowerCase()} />
                          <Chip size="small" color={activation.activates ? "success" : "default"} variant="outlined" label={activation.label} />
                          {proposalSourceLabel(proposal.metadataJson) ? <Chip size="small" color="secondary" variant="outlined" label={proposalSourceLabel(proposal.metadataJson)} /> : null}
                        </Stack>
                        <Typography variant="body2">{proposal.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{proposal.summary}</Typography>
                        {activation.detail ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            {activation.detail}
                          </Typography>
                        ) : null}
                        {proposal.status === "PROPOSED" ? (
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <ActionButton
                              postTo={`/api/observability/proposals/${proposal.id}/accept`}
                              variant="outlined"
                              color="success"
                              size="small"
                              message={activation.activates ? "Proposal accepted and learning activated." : "Proposal accepted for review."}
                            >
                              Accept
                            </ActionButton>
                            <ActionButton
                              postTo={`/api/observability/proposals/${proposal.id}/dismiss`}
                              variant="outlined"
                              color="secondary"
                              size="small"
                              message="Proposal dismissed."
                            >
                              Dismiss
                            </ActionButton>
                          </Stack>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No quality improvement proposals have been generated yet.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Card id="settings-outcome-calibration">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Outcome calibration" />
                  <Chip size="small" variant="outlined" label={`${outcomeCalibration?.summary.applied ?? 0} applied`} />
                  <Chip size="small" color={(outcomeCalibration?.summary.callbackRate ?? 0) > 0 ? "success" : "default"} variant="outlined" label={outcomeCalibration?.summary.callbackRate === null || outcomeCalibration?.summary.callbackRate === undefined ? "no callback data" : `${outcomeCalibration.summary.callbackRate}% callback`} />
                  <Chip size="small" color={(outcomeCalibration?.signals.length ?? 0) ? "warning" : "success"} variant="outlined" label={`${outcomeCalibration?.signals.length ?? 0} signal${outcomeCalibration?.signals.length === 1 ? "" : "s"}`} />
                </Stack>
                <Typography variant="h3">Outcome calibration</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Job search, matching, agency approval, and assistant behavior are scored against real outcomes. Signals refresh after major job, application, email, and assistant events; manual recompute is available for repair or backfill.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <ActionButton
                  postTo="/api/observability/outcomes/recompute"
                  variant="outlined"
                  color="info"
                  size="small"
                  message="Outcome calibration recomputed."
                >
                  Repair outcome signals
                </ActionButton>
                <ActionButton
                  postTo="/api/observability/outcomes/propose-actions"
                  variant="outlined"
                  color="secondary"
                  size="small"
                  message="Outcome review proposals updated."
                >
                  Create proposals from actions
                </ActionButton>
              </Stack>
              {outcomeCalibration ? (
                <>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Chip size="small" variant="outlined" label={`${outcomeCalibration.summary.applications} applications`} />
                    <Chip size="small" variant="outlined" label={`${outcomeCalibration.summary.positiveOutcomes} positive`} />
                    <Chip size="small" variant="outlined" label={`${outcomeCalibration.summary.negativeOutcomes} negative`} />
                    <Chip size="small" color={outcomeCalibration.summary.resurfacedSuppressedJobs ? "warning" : "success"} variant="outlined" label={`${outcomeCalibration.summary.resurfacedSuppressedJobs} resurfaced`} />
                    <Chip size="small" color={outcomeCalibration.summary.duplicateActiveGroups ? "warning" : "success"} variant="outlined" label={`${outcomeCalibration.summary.duplicateActiveGroups} duplicate groups`} />
                    <Chip size="small" color={outcomeCalibration.summary.rejectedHighScoreMatches ? "warning" : "success"} variant="outlined" label={`${outcomeCalibration.summary.rejectedHighScoreMatches} rejected high-score`} />
                    <Chip size="small" color={outcomeCalibration.summary.assistantFailures ? "warning" : "success"} variant="outlined" label={`${outcomeCalibration.summary.assistantFailures} assistant failures`} />
                  </Stack>
                  <Stack spacing={1.25}>
                    {outcomeCalibration.workflows.map((workflow) => (
                      <Box key={workflow.target} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                          <Chip size="small" label={workflow.target.toLowerCase().replace(/_/g, " ")} />
                          <Chip size="small" color={outcomeStatusColor(workflow.status)} label={workflow.status.replace(/_/g, " ")} />
                          <Chip size="small" variant="outlined" label={workflow.score === null ? "not scored" : `${workflow.score} score`} />
                        </Stack>
                        <Typography variant="body2">{workflow.summary}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  {outcomeTrends ? (
                    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                        <Chip size="small" color="info" label="Outcome trends" />
                        <Chip size="small" variant="outlined" label={`${outcomeTrends.snapshots.length} snapshot${outcomeTrends.snapshots.length === 1 ? "" : "s"}`} />
                      </Stack>
                      <Typography variant="h4">Outcome trends</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Aggregate snapshot history for outcome quality. Trends are read-only and do not change agent behavior.
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <ActionButton
                          postTo="/api/observability/outcomes/trends/alerts"
                          variant="outlined"
                          color="warning"
                          size="small"
                          message="Outcome regression reviews updated."
                        >
                          Create regression review
                        </ActionButton>
                      </Box>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                        {outcomeTrends.metrics.map((metric) => (
                          <Chip
                            key={metric.key}
                            size="small"
                            color={outcomeTrendColor(metric.direction)}
                            variant={metric.direction === "insufficient_data" ? "outlined" : "filled"}
                            label={`${metric.label}: ${outcomeTrendValue(metric.latest)}${metric.delta === null ? "" : ` (${metric.delta > 0 ? "+" : ""}${metric.delta})`}`}
                          />
                        ))}
                      </Stack>
                      <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                        {outcomeTrends.workflows.map((workflow) => (
                          <Box key={workflow.target} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
                              <Chip size="small" variant="outlined" label={workflow.target.toLowerCase().replace(/_/g, " ")} />
                              <Chip size="small" color={outcomeTrendColor(workflow.direction)} label={workflow.direction.replace(/_/g, " ")} />
                              <Chip size="small" variant="outlined" label={`score ${outcomeTrendValue(workflow.latestScore)}${workflow.delta === null ? "" : ` (${workflow.delta > 0 ? "+" : ""}${workflow.delta})`}`} />
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                      <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, mt: 1.5 }}>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                          <Chip size="small" color="warning" label="Regression triage" />
                          <Chip size="small" variant="outlined" label={`${outcomeRegressionTriage.length} open`} />
                          <Chip size="small" color={outcomeRegressionTriage.some((item) => item.priority === "high") ? "warning" : "default"} variant="outlined" label={`${outcomeRegressionTriage.filter((item) => item.priority === "high").length} high priority`} />
                        </Stack>
                        <Typography variant="h4">Regression triage</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Open regression proposals ranked by urgency and routed to the clearest review surface. Triage is advisory and does not change agent behavior.
                        </Typography>
                        {outcomeRegressionTriage.length ? (
                          <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                            {outcomeRegressionTriage.map((item) => (
                              <Box key={item.proposalId} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                                  <Chip size="small" color={outcomeRegressionPriorityColor(item.priority)} label={`${item.priority} priority`} />
                                  <Chip size="small" variant="outlined" label={item.ownerArea} />
                                  <Chip size="small" variant="outlined" label={item.signalType.replace(/_/g, " ")} />
                                  <Chip size="small" variant="outlined" label={`${item.target.toLowerCase().replace(/_/g, " ")}`} />
                                </Stack>
                                <Typography variant="body2">{item.title}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{item.reason}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                  {item.trendKey.replace(/:/g, " ")} changed from {outcomeTrendValue(item.previous)} to {outcomeTrendValue(item.latest)}
                                  {item.delta === null ? "" : ` (${item.delta > 0 ? "+" : ""}${item.delta})`}
                                </Typography>
                                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                                  <ActionButton href={item.reviewHref} variant="text" size="small">
                                    Open review
                                  </ActionButton>
                                  <ActionButton href="#settings-quality-proposals" variant="text" size="small">
                                    Open proposal
                                  </ActionButton>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No open outcome regression proposals need triage.</Typography>
                        )}
                      </Box>
                    </Box>
                  ) : null}
                  {outcomeCalibration.signals.length ? (
                    <Stack spacing={1.25}>
                      {outcomeCalibration.signals.map((signal) => (
                        <Box key={signal.key} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                            <Chip size="small" color="info" variant="outlined" label={signal.target.toLowerCase().replace(/_/g, " ")} />
                            <Chip size="small" color={outcomeStatusColor(signal.severity)} label={signal.severity.replace(/_/g, " ")} />
                            <Chip size="small" variant="outlined" label={`${signal.count} found`} />
                          </Stack>
                          <Typography variant="body2">{signal.title}</Typography>
                          <Typography variant="caption" color="text.secondary">{signal.summary}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No bad outcome calibration signals are currently detected.</Typography>
                  )}
                  <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                      <Chip size="small" color="secondary" label="Review actions" />
                      <Chip size="small" variant="outlined" label={`${outcomeCalibration.actions.length} recommended`} />
                    </Stack>
                    <Typography variant="h4">Recommended review actions</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Advisory next steps based on outcome signals. These can be promoted into governed proposals, but they do not directly change sources, profiles, thresholds, suppressions, or automation.
                    </Typography>
                    {outcomeCalibration.actions.length ? (
                      <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                        {outcomeCalibration.actions.map((action) => (
                          <Box key={action.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                              <Chip size="small" color={outcomeActionSeverityColor(action.severity)} label={action.severity.replace(/_/g, " ")} />
                              <Chip size="small" variant="outlined" label={action.category.replace(/_/g, " ")} />
                              <Chip size="small" variant="outlined" label={`${action.affectedCount} affected`} />
                              <Chip size="small" color={outcomeActionProposalColor(action.proposal?.status)} variant={action.proposal ? "filled" : "outlined"} label={outcomeActionProposalLabel(action.proposal?.status)} />
                              {action.proposal ? <Chip size="small" variant="outlined" label={action.proposal.activationLabel.replace(/_/g, " ")} /> : null}
                            </Stack>
                            <Typography variant="body2">{action.title}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{action.summary}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>{action.rationale}</Typography>
                            {action.proposal ? (
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                Linked proposal: {action.proposal.title}
                              </Typography>
                            ) : null}
                            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                              <ActionButton href={action.href} variant="text" size="small">
                                Open
                              </ActionButton>
                              {action.proposal ? (
                                <ActionButton href="#settings-quality-proposals" variant="text" size="small">
                                  Open proposal
                                </ActionButton>
                              ) : null}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No outcome review actions are currently recommended.</Typography>
                    )}
                  </Box>
                  <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                    <Typography variant="h4">Signal drill-down</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Review the jobs, profiles, sources, duplicate groups, and assistant runs behind the scorecard.
                    </Typography>
                    <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                      <OutcomeDetailSection
                        title="Resurfaced suppressed jobs"
                        empty="No rejected or applied jobs are currently resurfacing in active results."
                        rows={outcomeCalibration.details.resurfacedSuppressedJobs.map((item) => ({
                          key: item.suppressionId,
                          title: `${item.company} - ${item.title}`,
                          detail: `${item.suppressionKind.toLowerCase().replace(/_/g, " ")} via ${item.suppressionSource.replace(/_/g, " ")}${item.matchStatus ? ` · active as ${item.matchStatus.replace(/_/g, " ")}` : ""}${item.score === null ? "" : ` · ${item.score} score`}`,
                          href: item.jobId ? `/jobs/${item.jobId}` : undefined,
                        }))}
                      />
                      <OutcomeDetailSection
                        title="Active duplicate groups"
                        empty="No active duplicate groups have more than one live match."
                        rows={outcomeCalibration.details.activeDuplicateGroups.map((item) => ({
                          key: item.duplicateGroupId,
                          title: `${item.company} - ${item.title}`,
                          detail: `${item.activeMatchCount} active match${item.activeMatchCount === 1 ? "" : "es"} · ${item.jobs.map((job) => `${job.status.replace(/_/g, " ")} ${job.score}`).join(", ")}`,
                          href: item.jobs[0]?.jobId ? `/jobs/${item.jobs[0].jobId}` : undefined,
                        }))}
                      />
                      <OutcomeDetailSection
                        title="Rejected high-score matches"
                        empty="No 85+ score matches are currently rejected."
                        rows={outcomeCalibration.details.rejectedHighScoreMatches.map((item) => ({
                          key: item.matchId,
                          title: `${item.company} - ${item.title}`,
                          detail: `${item.score} score · ${item.profileName} · rejected ${item.rejectedAt.toLocaleString()}`,
                          href: `/jobs/${item.jobId}`,
                        }))}
                      />
                      <OutcomeDetailSection
                        title="Assistant failures"
                        empty="No recent assistant failures or blockers are contributing to outcome calibration."
                        rows={outcomeCalibration.details.assistantFailures.map((item) => ({
                          key: item.automationRunId,
                          title: `${item.company} - ${item.title}`,
                          detail: `${item.status.toLowerCase().replace(/_/g, " ")}${item.blockerType ? ` · ${item.blockerType.replace(/_/g, " ")}` : ""}${item.currentNode ? ` · ${item.currentNode.replace(/_/g, " ")}` : ""}${item.blockerMessage ? ` · ${item.blockerMessage}` : ""}`,
                          href: `/applications/${item.applicationId}`,
                        }))}
                      />
                      <OutcomeDetailSection
                        title="Profile breakdown"
                        empty="No profile-level outcome data is available yet."
                        rows={outcomeCalibration.details.profileBreakdown.map((item) => ({
                          key: item.profileId,
                          title: item.profileName,
                          detail: `${item.activeMatches} active · ${item.rejectedHighScoreMatches} rejected high-score · ${item.applied} applied · ${item.positiveOutcomes} positive${item.callbackRate === null ? "" : ` · ${item.callbackRate}% callback`}`,
                          href: "/profiles",
                        }))}
                      />
                      <OutcomeDetailSection
                        title="Source breakdown"
                        empty="No source-level outcome data is available yet."
                        rows={outcomeCalibration.details.sourceBreakdown.map((item) => ({
                          key: item.sourceId ?? item.sourceName,
                          title: item.sourceName,
                          detail: `${item.sourceType.toLowerCase()} · ${item.activeMatches} active · ${item.applications} applications · ${item.positiveOutcomes} positive${item.callbackRate === null ? "" : ` · ${item.callbackRate}% callback`} · ${item.noisySignals} noisy`,
                          href: "/sources",
                        }))}
                      />
                    </Stack>
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">Create a user profile before outcome calibration can run.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Card id="settings-learning-impact">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Learning impact" />
                  <Chip size="small" variant="outlined" label={`${learningImpact.length} active rule${learningImpact.length === 1 ? "" : "s"}`} />
                  <Chip size="small" color={learningImpact.some((item) => item.status === "needs_review") ? "warning" : "success"} variant="outlined" label={`${learningImpact.filter((item) => item.status === "needs_review").length} need review`} />
                  <Chip size="small" color={autoRollbackCandidates(learningImpact).length ? "warning" : "success"} variant="outlined" label={`${autoRollbackCandidates(learningImpact).length} auto rollback`} />
                </Stack>
                <Typography variant="h3">Learning impact</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Active proposal-backed learning is tracked against later agent runs and quality evaluations. Auto rollback only disables future use, never deletes history, and captures rollback as a quality signal.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <ActionButton
                  postTo="/api/observability/learning-impact/auto-rollback"
                  body={{ dryRun: true }}
                  variant="outlined"
                  color="info"
                  size="small"
                  message="Auto rollback preview completed."
                >
                  Preview auto rollback
                </ActionButton>
                <ActionButton
                  postTo="/api/observability/learning-impact/auto-rollback"
                  body={{ dryRun: false }}
                  variant="outlined"
                  color="warning"
                  size="small"
                  message="Auto rollback completed."
                >
                  Run auto rollback
                </ActionButton>
              </Stack>
              {autoRollbackCandidates(learningImpact).length ? (
                <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>Auto rollback candidates</Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                    {autoRollbackCandidates(learningImpact).map((item) => (
                      <Chip
                        key={item.adjustmentId}
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={`${item.skillId.replace(/_/g, " ")}${item.category ? `: ${item.category.replace(/_/g, " ")}` : ""}`}
                      />
                    ))}
                  </Stack>
                </Box>
              ) : null}
              {learningImpact.length ? (
                <Stack spacing={1.25}>
                  {learningImpact.map((item) => (
                    <Box key={item.adjustmentId} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                        <Chip size="small" label={item.skillId.replace(/_/g, " ")} />
                        {item.category ? <Chip size="small" variant="outlined" label={item.category.replace(/_/g, " ")} /> : null}
                        <Chip size="small" color={learningImpactStatusColor(item.status)} label={item.status.replace(/_/g, " ")} />
                        <Chip size="small" variant="outlined" label={`${item.appliedRunCount} applied run${item.appliedRunCount === 1 ? "" : "s"}`} />
                        {item.averageScore === null ? null : <Chip size="small" variant="outlined" label={`${item.averageScore} avg`} />}
                      </Stack>
                      <Typography variant="body2">{item.impactSummary}</Typography>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {item.latestAppliedAt ? `Latest applied ${item.latestAppliedAt.toLocaleString()}` : `Active since ${item.activeSince.toLocaleString()}`}
                          {item.relatedFailedCount || item.relatedNeedsReviewCount ? ` · ${item.relatedFailedCount} failed, ${item.relatedNeedsReviewCount} needs review` : ""}
                        </Typography>
                        <ActionButton
                          postTo={`/api/skills/adjustments/${item.adjustmentId}/reject`}
                          body={{
                            reason: item.status === "needs_review" ? item.impactSummary : "Disabled from learning impact.",
                            impact: {
                              status: item.status,
                              appliedRunCount: item.appliedRunCount,
                              relatedFailedCount: item.relatedFailedCount,
                              relatedNeedsReviewCount: item.relatedNeedsReviewCount,
                              averageScore: item.averageScore,
                            },
                          }}
                          variant="outlined"
                          color={item.status === "needs_review" ? "warning" : "secondary"}
                          size="small"
                          message="Learning rule disabled."
                        >
                          Disable learning
                        </ActionButton>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No active proposal-backed learning has enough metadata to analyze yet.</Typography>
              )}
              <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="secondary" label="Rollback history" />
                  <Chip size="small" variant="outlined" label={`${rollbackAudit.length} recent`} />
                  <Chip size="small" variant="outlined" color={rollbackAudit.some((item) => item.source === "auto_learning_rollback") ? "warning" : "default"} label={`${rollbackAudit.filter((item) => item.source === "auto_learning_rollback").length} auto`} />
                  <Chip size="small" variant="outlined" label={`${rollbackAudit.filter((item) => item.source !== "auto_learning_rollback").length} manual`} />
                </Stack>
                <Typography variant="h4">Rollback history</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Recent disabled learned rules with the reason, impact snapshot, and linked rollback review signals.
                </Typography>
                {rollbackAudit.length ? (
                  <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                    {rollbackAudit.map((item) => (
                      <Box key={item.adjustmentId} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
                          <Chip size="small" label={item.skillId.replace(/_/g, " ")} />
                          {item.category ? <Chip size="small" variant="outlined" label={item.category.replace(/_/g, " ")} /> : null}
                          <Chip size="small" color={item.source === "auto_learning_rollback" ? "warning" : "secondary"} variant="outlined" label={item.sourceLabel} />
                          {item.target ? <Chip size="small" variant="outlined" label={item.target.toLowerCase().replace(/_/g, " ")} /> : null}
                          <Chip size="small" variant="outlined" label={`${item.rollbackExampleCount} rollback example${item.rollbackExampleCount === 1 ? "" : "s"}`} />
                          <Chip size="small" variant="outlined" label={`${item.rollbackProposalCount} proposal${item.rollbackProposalCount === 1 ? "" : "s"}`} />
                          {item.latestProposalStatus ? <Chip size="small" color={item.latestProposalStatus === "PROPOSED" ? "warning" : "default"} variant="outlined" label={item.latestProposalStatus.toLowerCase()} /> : null}
                        </Stack>
                        <Typography variant="body2">{item.reason ?? "No rollback reason recorded."}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {item.disabledAt ? `Disabled ${item.disabledAt.toLocaleString()}` : `Created ${item.createdAt.toLocaleString()}`}
                          {item.impact.status ? ` · impact ${item.impact.status.replace(/_/g, " ")}` : ""}
                          {item.impact.appliedRunCount === null ? "" : ` · ${item.impact.appliedRunCount} applied run${item.impact.appliedRunCount === 1 ? "" : "s"}`}
                          {item.impact.relatedFailedCount || item.impact.relatedNeedsReviewCount ? ` · ${item.impact.relatedFailedCount ?? 0} failed, ${item.impact.relatedNeedsReviewCount ?? 0} needs review` : ""}
                          {item.impact.averageScore === null ? "" : ` · ${item.impact.averageScore} avg`}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No learned-rule rollbacks have been recorded yet.</Typography>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Card id="settings-field-learning">
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Field learning" />
                  <Chip size="small" variant="outlined" label={`${fieldMemories.filter((item) => item.status === "ACTIVE").length} auto-fill`} />
                  <Chip size="small" variant="outlined" label={`${fieldMemories.filter((item) => item.status === "NEEDS_REVIEW").length} review`} />
                  <Chip size="small" variant="outlined" label={`${fieldMemories.filter((item) => item.status === "DISABLED").length} disabled`} />
                </Stack>
                <Typography variant="h3">Application field memories</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  The assistant saves safe fields you manually fill, generates safe context-aware answers for new questions, and reuses approved memories on future applications.
                </Typography>
              </Box>
              {searchParams?.host || searchParams?.applicationId ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {searchParams?.host ? <Chip size="small" variant="outlined" label={`Host: ${searchParams.host}`} /> : null}
                  {searchParams?.applicationId ? <Chip size="small" variant="outlined" label="Current application" /> : null}
                </Stack>
              ) : null}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
                <FieldMemoryMetric label="Needs review" value={fieldMemories.filter((memory) => memory.status === "NEEDS_REVIEW").length} tone="warning" />
                <FieldMemoryMetric label="Auto-fill active" value={fieldMemories.filter((memory) => memory.status === "ACTIVE").length} tone="success" />
                <FieldMemoryMetric label="Disabled" value={fieldMemories.filter((memory) => memory.status === "DISABLED").length} tone="default" />
              </Box>
              <FieldMemorySection
                title="Review Before Auto-Fill"
                description="These fields were learned, but the system will not auto-use them until you approve them."
                memories={fieldMemories.filter((memory) => memory.status === "NEEDS_REVIEW")}
              />
              <FieldMemorySection
                title="Active Auto-Fill Memories"
                description="These approved memories are available to the assistant on matching application forms."
                memories={fieldMemories.filter((memory) => memory.status === "ACTIVE")}
              />
              {fieldMemories.some((memory) => memory.status === "DISABLED") ? (
                <FieldMemorySection
                  title="Disabled Memories"
                  description="These memories will not be reused."
                  memories={fieldMemories.filter((memory) => memory.status === "DISABLED")}
                />
              ) : null}
              {!fieldMemories.length ? <Typography variant="body2" color="text.secondary">No application field memories have been learned yet.</Typography> : null}
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
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {adjustment.appliedAt ? `Applied ${adjustment.appliedAt.toLocaleString()}` : `Created ${adjustment.createdAt.toLocaleString()}`}
                        </Typography>
                        {adjustment.status === "ACTIVE" ? (
                          <ActionButton
                            postTo={`/api/skills/adjustments/${adjustment.id}/reject`}
                            body={{ reason: "Disabled from learning audit log.", source: "learning_audit_log" }}
                            variant="outlined"
                            color="secondary"
                            size="small"
                            message="Learning rule disabled."
                          >
                            Disable learning
                          </ActionButton>
                        ) : null}
                      </Stack>
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
          </>
        ) : null}
        {group === "system" || group === "search" || group === "application" || group === "admin" ? (
        <SettingsClient
          group={group}
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
            linkedinContentModel: user?.aiSettings?.linkedinContentModel ?? DEFAULT_LINKEDIN_CONTENT_MODEL,
            linkedinDiagramImageModel: user?.aiSettings?.linkedinDiagramImageModel ?? DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL,
          }}
          langSmithSettings={{
            configured: process.env.LANGSMITH_TRACING === "true" && Boolean(process.env.LANGSMITH_API_KEY),
            tracing: process.env.LANGSMITH_TRACING === "true",
            project: process.env.LANGSMITH_PROJECT ?? "job-search-os-local",
            redactionMode: "metadata",
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
            linkedinSubject: user?.profile?.linkedinSubject ?? null,
            linkedinPictureUrl: user?.profile?.linkedinPictureUrl ?? null,
            linkedinLocale: user?.profile?.linkedinLocale ?? null,
            linkedinEmailVerified: user?.profile?.linkedinEmailVerified ?? null,
            linkedinConnectedAt: user?.profile?.linkedinConnectedAt?.toLocaleString() ?? null,
            linkedinOidcConfigured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
            linkedinShareConnected: linkedinShareConnection?.status === "CONNECTED" && normalizeLinkedInScopes(linkedinShareConnection.scopes).includes("w_member_social"),
            linkedinShareStatus: linkedinShareConnection?.status ?? null,
            linkedinShareLastPublishedAt: linkedinShareConnection?.lastPublishedAt?.toLocaleString() ?? null,
            githubUrl: user?.profile?.githubUrl ?? "https://github.com/carlwelchdesign",
            raceAnswer: user?.profile?.raceAnswer ?? "",
            genderAnswer: user?.profile?.genderAnswer ?? "",
            veteranStatusAnswer: user?.profile?.veteranStatusAnswer ?? "",
            disabilityAnswer: user?.profile?.disabilityAnswer ?? "",
            resumeFormat: normalizeResumeFormat(user?.profile?.resumeFormat),
            githubRepositoryCount: githubRepoCount,
            latestGithubSync: latestGithubSyncDate?.toLocaleString() ?? null,
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
          serviceHealthSettings={serviceHealthSettings}
        />
        ) : null}
      </Stack>
    </AppShell>
  );
}

function latestDate(values: Date[]) {
  if (!values.length) return null;
  return new Date(Math.max(...values.map((value) => value.getTime())));
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
      href: "/settings/system#settings-ai",
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
      href: "/settings/application#settings-profile-links",
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
      href: "/settings/application#settings-github",
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
      href: "/settings/system#settings-notifications",
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
      href: "/settings/search#settings-company-sources",
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
      href: "/settings/search#settings-cron",
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
      href: "/settings/system#settings-email-sync",
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
    href: "/settings/application#settings-automation",
    color: input.automationEnabled ? "success" as const : "primary" as const,
    icon: <SettingsSuggestOutlinedIcon />,
    scope: "application flow",
  };
}

function proposalActivationLabel(proposal: {
  target: string;
  riskLevel: string;
  type: string;
  metadataJson: unknown;
  patchJson: unknown;
}) {
  const metadata = isRecord(proposal.metadataJson) ? proposal.metadataJson : {};
  const patch = isRecord(proposal.patchJson) ? proposal.patchJson : {};
  const existingActivation = isRecord(metadata.activation) ? metadata.activation : null;
  const category = String(metadata.failureCategory ?? patch.category ?? "");
  const mapped =
    proposal.riskLevel === "LOW" &&
    proposal.type !== "PROMPT" &&
    (
      (proposal.target === "JOB_MATCHING" && category === "high_score_user_rejected") ||
      (proposal.target === "JOB_SEARCH" && ["dedupe_ineffective", "low_saved_yield", "market_search_adaptation"].includes(category)) ||
      (proposal.target === "APPLICATION_ASSISTANT" && ["cover_letter_field", "field_classification"].includes(category)) ||
      (proposal.target === "RECRUITING_AGENCY" && ["CANDIDATE_FAILURE", "candidate_failure"].includes(category))
    );

  if (existingActivation) {
    return {
      activates: mapped,
      label: existingActivation.status === "created" || existingActivation.status === "already_active" ? "learning active" : "review-only",
      detail: typeof existingActivation.reason === "string" ? existingActivation.reason : null,
    };
  }

  return mapped
    ? { activates: true, label: "activates learning", detail: "Accepting creates a low-risk skill adjustment." }
    : { activates: false, label: "review-only", detail: "Accepting records review intent without changing agent behavior." };
}

function proposalSourceLabel(metadataJson: unknown) {
  const metadata = isRecord(metadataJson) ? metadataJson : {};
  if (metadata.source === "outcome_review_action") return "outcome action";
  if (metadata.source === "outcome_trend_regression") return "outcome regression";
  return null;
}

function learningImpactStatusColor(status: string) {
  if (status === "helping") return "success" as const;
  if (status === "needs_review") return "warning" as const;
  if (status === "neutral") return "info" as const;
  return "default" as const;
}

function outcomeStatusColor(status: string) {
  if (status === "healthy") return "success" as const;
  if (status === "needs_review") return "warning" as const;
  if (status === "watch") return "info" as const;
  return "default" as const;
}

function outcomeActionSeverityColor(status: string) {
  if (status === "needs_review") return "warning" as const;
  if (status === "watch") return "info" as const;
  return "default" as const;
}

function outcomeActionProposalColor(status?: string) {
  if (status === "PROPOSED") return "warning" as const;
  if (status === "ACCEPTED") return "success" as const;
  if (status === "DISMISSED") return "default" as const;
  return "default" as const;
}

function outcomeActionProposalLabel(status?: string) {
  if (status === "PROPOSED") return "proposal open";
  if (status === "ACCEPTED") return "accepted";
  if (status === "DISMISSED") return "dismissed";
  return "not promoted";
}

function outcomeTrendColor(status: string) {
  if (status === "improving") return "success" as const;
  if (status === "regressing") return "warning" as const;
  if (status === "flat") return "info" as const;
  return "default" as const;
}

function outcomeRegressionPriorityColor(priority: string) {
  if (priority === "high") return "warning" as const;
  if (priority === "medium") return "info" as const;
  return "default" as const;
}

function outcomeTrendValue(value: number | null) {
  return value === null ? "n/a" : String(value);
}

function OutcomeDetailSection({ title, empty, rows }: {
  title: string;
  empty: string;
  rows: Array<{ key: string; title: string; detail: string; href?: string }>;
}) {
  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{title}</Typography>
        <Chip size="small" variant="outlined" label={`${rows.length} item${rows.length === 1 ? "" : "s"}`} />
      </Stack>
      {rows.length ? (
        <Stack spacing={0.75}>
          {rows.slice(0, 5).map((row) => (
            <Stack key={row.key} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
              <Box>
                <Typography variant="body2">{row.title}</Typography>
                <Typography variant="caption" color="text.secondary">{row.detail}</Typography>
              </Box>
              {row.href ? (
                <ActionButton href={row.href} variant="text" size="small">
                  Open
                </ActionButton>
              ) : null}
            </Stack>
          ))}
          {rows.length > 5 ? (
            <Typography variant="caption" color="text.secondary">Showing 5 of {rows.length} items.</Typography>
          ) : null}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
      )}
    </Box>
  );
}

function autoRollbackCandidates(
  items: Array<{
    adjustmentId: string;
    skillId: string;
    category: string | null;
    status: string;
    appliedRunCount: number;
    relatedFailedCount: number;
    relatedNeedsReviewCount: number;
  }>,
) {
  return items.filter((item) => (
    item.status === "needs_review" &&
    item.appliedRunCount >= 2 &&
    (item.relatedFailedCount >= 1 || item.relatedNeedsReviewCount >= 2)
  ));
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

type SettingsNextAction = ReturnType<typeof getSettingsNextAction>;

function SettingsOverview({ nextAction }: { nextAction: SettingsNextAction }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
      {SETTINGS_ROUTES.map((route) => (
        <Card key={route.href} component={Link} href={route.href} variant="outlined" sx={{ textDecoration: "none", color: "inherit", height: "100%" }}>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Typography variant="h3">{route.label}</Typography>
                {nextAction.href.startsWith(route.href) ? <Chip size="small" color={nextAction.color} label="Next action" /> : null}
              </Stack>
              <Typography variant="body2" color="text.secondary">{route.description}</Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function FieldMemoryMetric({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "default" }) {
  return (
    <Card sx={{ borderColor: tone === "success" ? "success.main" : tone === "warning" ? "warning.main" : "divider" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h1" sx={{ mt: 0.5 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

function FieldMemorySection({
  title,
  description,
  memories,
}: {
  title: string;
  description: string;
  memories: FieldMemoryWithSource[];
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h3">{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
          </Box>
          <FieldMemoryBulkActions memoryIds={safeReviewMemoryIds(memories)} />
          {memories.length ? (
            <Stack spacing={1.25}>
              {memories.map((memory) => (
                <Box key={memory.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                    <Chip size="small" color={memory.status === "ACTIVE" ? "success" : memory.status === "NEEDS_REVIEW" ? "warning" : "default"} label={memory.status.toLowerCase().replace(/_/g, " ")} />
                    <Chip size="small" label={memory.category.replace(/_/g, " ")} />
                    <Chip size="small" variant="outlined" label={memory.host} />
                    <Chip size="small" variant="outlined" label={`${memory.confidence}% confidence`} />
                    <Chip size="small" variant="outlined" label={memory.sensitivity.toLowerCase()} />
                    <Chip size="small" variant="outlined" label={memory.reusePolicy.toLowerCase().replace(/_/g, " ")} />
                  </Stack>
                  <Typography sx={{ fontWeight: 850 }}>{memory.label}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>{memory.answer}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Learned from {memory.sourceApplication?.jobPosting.company ?? "unknown company"} - {memory.sourceApplication?.jobPosting.title ?? "unknown role"} · seen {memory.lastSeenAt.toLocaleString()}
                    {memory.useCount ? ` · used ${memory.useCount} time${memory.useCount === 1 ? "" : "s"}` : ""}
                  </Typography>
                  {memory.status !== "DISABLED" ? (
                    <Box sx={{ mt: 1.25 }}>
                      <FieldMemoryActions memoryId={memory.id} canApprove={memory.status === "NEEDS_REVIEW"} />
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">Nothing here yet.</Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function safeReviewMemoryIds(memories: FieldMemoryWithSource[]) {
  const ids: string[] = [];
  for (const memory of memories) {
    if (memory.status === "NEEDS_REVIEW" && memory.sensitivity !== "HIGH") ids.push(memory.id);
  }
  return ids;
}

function SettingsRouteNav({ activeGroup }: { activeGroup: SettingsRouteGroup }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: "background.default" }}>
      <CardContent sx={{ py: "10px !important" }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mr: 0.5, whiteSpace: "nowrap" }}>
            Settings:
          </Typography>
          {SETTINGS_ROUTES.map((section) => (
            <Button
              key={section.href}
              component={Link}
              href={section.href}
              size="small"
              variant={section.group === activeGroup ? "contained" : "text"}
              sx={{ fontSize: "0.75rem", py: 0.25, px: 0.75, minWidth: 0, color: section.group === activeGroup ? undefined : "text.secondary", "&:hover": { color: section.group === activeGroup ? undefined : "primary.main" } }}
            >
              {section.label}
            </Button>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
