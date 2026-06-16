import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { AppShell } from "@/app/app-shell";
import { RunDailyPlanButton } from "@/app/dashboard/daily-plan-card";
import { LinkedInAnalyticsCard } from "@/app/dashboard/linkedin-analytics-card";
import { MarketAnalysisCard, type MarketTrendPoint } from "@/app/dashboard/market-analysis-card";
import { ActionButton } from "@/components/action-button";
import { AgencyRunControl } from "@/components/agency-run-control";
import { JobRejectButton } from "@/components/job-reject-button";
import { SearchRunCommandCenter } from "@/components/search-run-command-center";
import { ReadinessOperatingCockpit } from "@/components/readiness/readiness-cockpit";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { formatStatus } from "@/components/ui/status-chip";
import { agentUserRequestHref, agentUserRequestTypeLabel, listOpenAgentUserRequests } from "@/lib/agent-user-requests";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import { auditApplicationIntegrity } from "@/lib/applications/integrity";
import { submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { getLinkedInAnalyticsSummary } from "@/lib/linkedin/analytics";
import { getLatestJoleneChiefBrief, type JoleneChiefOutput } from "@/lib/jolene/chief-of-staff";
import { getLatestEmailOpsSummary } from "@/lib/jolene/email-ops";
import { getLatestJoleneOperatingLoop, type JoleneOperatingLoopOutput } from "@/lib/jolene/operating-loop";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { buildLifecycleReadiness } from "@/lib/readiness/lifecycle";
import { getServiceFallbacks } from "@/lib/service-fallbacks";

export const dynamic = "force-dynamic";

export type DashboardRouteGroup = "overview" | "search" | "email" | "social" | "market" | "pipeline";

type DailyPlanOutput = {
  generatedAt?: string;
  summary?: string;
  actions?: Array<{ priority: number; category: string; title: string; detail: string; href: string; count?: number }>;
};

const DASHBOARD_ROUTES: Array<{ href: string; label: string; group: DashboardRouteGroup }> = [
  { href: "/dashboard", label: "Overview", group: "overview" },
  { href: "/dashboard/search", label: "Search Ops", group: "search" },
  { href: "/dashboard/email-ops", label: "Email Ops", group: "email" },
  { href: "/dashboard/social", label: "Social", group: "social" },
  { href: "/dashboard/market", label: "Market", group: "market" },
  { href: "/dashboard/pipeline", label: "Pipeline", group: "pipeline" },
];

const HEADER_COPY: Record<DashboardRouteGroup, { title: string; description: string }> = {
  overview: {
    title: "Agency Command Center",
    description: "Daily overview for the job search operating system, with links into focused command surfaces.",
  },
  search: {
    title: "Search Operations",
    description: "Run search, review live run analytics, trigger agency prep, and handle search exceptions.",
  },
  email: {
    title: "Email Operations",
    description: "Let Jolene's specialist inbox agents find job updates, draft calendar actions, and escalate only what needs review.",
  },
  social: {
    title: "Social Performance",
    description: "Track LinkedIn post analytics and open the LinkedIn content studio for agent-assisted publishing.",
  },
  market: {
    title: "Market Intelligence",
    description: "Review market briefs, cited research, trend charts, and search-learning recommendations.",
  },
  pipeline: {
    title: "Pipeline Health",
    description: "Review blockers, daily plan, state integrity, application status, and profile health.",
  },
};

export function DashboardShell({ group, children }: { group: DashboardRouteGroup; children: React.ReactNode }) {
  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Command center"
          title={HEADER_COPY[group].title}
          description={HEADER_COPY[group].description}
          actions={<ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddCircleOutlineIcon />}>Add manual job</ActionButton>}
        />
        <DashboardRouteNav activeGroup={group} />
        {children}
      </Stack>
    </AppShell>
  );
}

export async function DashboardOverviewPage() {
  const [profiles, latestRun, applicationStatusCounts, readyApplicationCount, needsReview, agentUserRequests, latestDailyPlanRun, dashboardUser] = await Promise.all([
    prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.application.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.application.count({ where: { status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } } }),
    prisma.jobProfileMatch.findMany({
      where: { status: "needs_review", jobPosting: { applications: { none: { status: { in: submittedApplicationStatuses } } } } },
      include: { jobPosting: true, jobSearchProfile: { select: { userId: true } } },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    listOpenAgentUserRequests(5),
    prisma.agentRun.findFirst({ where: { agentType: "DAILY_COMMAND_CENTER", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
    prisma.user.findFirst({ select: { id: true, notificationSettings: true } }),
  ]);
  const [latestJoleneRun, latestOperatingLoopRun] = dashboardUser?.id
    ? await Promise.all([
        getLatestJoleneChiefBrief(dashboardUser.id),
        getLatestJoleneOperatingLoop(dashboardUser.id),
      ])
    : [null, null];
  const readiness = dashboardUser?.id ? await buildLifecycleReadiness({ userId: dashboardUser.id }) : null;
  const suppressionStates = await loadJobSuppressionStatesByUserIds(needsReview.map((match) => match.jobSearchProfile.userId));
  const needsReviewCount = uniqueMatchesByCanonicalJob(needsReview.filter((match) => {
    const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
    return !suppressionState || !isJobSuppressed(match.jobPosting, suppressionState);
  })).length;
  const applicationCountByStatus = new Map(applicationStatusCounts.map((count) => [count.status, count._count.status]));
  const dailyPlan = dailyPlanOutput(latestDailyPlanRun?.outputJson);
  const ns = dashboardUser?.notificationSettings as { pushoverEnabled?: boolean; emailEnabled?: boolean } | null;
  const fallbacks = getServiceFallbacks(["openai", "brave", "notifications"], { anyNotificationConfigured: Boolean(ns?.pushoverEnabled || ns?.emailEnabled) });

  return (
    <DashboardShell group="overview">
      <ServiceFallbackBanners items={fallbacks} />
      <JoleneChiefOfStaffCard
        runId={latestJoleneRun?.id ?? null}
        brief={joleneChiefOutput(latestJoleneRun?.outputJson)}
        operatingLoopRunId={latestOperatingLoopRun?.id ?? null}
        operatingLoop={joleneOperatingLoopOutput(latestOperatingLoopRun?.outputJson)}
      />
      {readiness ? <ReadinessOperatingCockpit readiness={readiness} /> : null}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 2 }}>
        <Metric label="Enabled profiles" value={profiles.length.toString()} helper="Active campaigns" />
        <Metric label="Exceptions" value={needsReviewCount.toString()} helper="Needs your decision" />
        <Metric label="Ready to apply" value={readyApplicationCount.toString()} helper="Prepared by agency" />
        <Metric label="Latest run" value={latestRun?.status ?? "None"} helper={latestRun ? latestRun.startedAt.toLocaleString() : "No runs yet"} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.1fr 0.9fr" }, gap: 2 }}>
        <DailyPlanCard dailyPlan={dailyPlan} />
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Focused workspaces</Typography>
              <Typography color="text.secondary">The old Command Center is split into smaller operating surfaces. Open the section that matches the work you need now.</Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                {DASHBOARD_ROUTES.filter((route) => route.group !== "overview").map((route) => (
                  <Button key={route.href} component={Link} href={route.href} variant="outlined" size="small">{route.label}</Button>
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
      <PipelineStatusSummary applicationCountByStatus={applicationCountByStatus} needsReviewCount={needsReviewCount} blockers={agentUserRequests.length} />
    </DashboardShell>
  );
}

function JoleneChiefOfStaffCard({ runId, brief, operatingLoopRunId, operatingLoop }: {
  runId: string | null;
  brief: JoleneChiefOutput | null;
  operatingLoopRunId: string | null;
  operatingLoop: JoleneOperatingLoopOutput | null;
}) {
  const topPriorities = brief?.priorities.slice(0, 3) ?? [];
  const proposalsByAction = new Map((brief?.delegatedWork ?? []).map((work) => [work.actionId, work]));
  const emailEvidence = brief?.evidence.find((item) => item.startsWith("Email Ops:"));
  const nextLoopAction = operatingLoop?.recommendedActions.find((action) => action.status === "proposed") ?? null;

  return (
    <Card sx={{ borderColor: "primary.main", bgcolor: "rgba(37, 99, 235, 0.06)" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="primary" label="Jolene, Chief of Staff" />
                <Chip size="small" variant="outlined" label={brief ? `Confidence ${brief.confidence}` : "No brief yet"} />
              </Stack>
              <Typography variant="h3">{brief ? brief.summary : "Jolene is ready to brief the operating system."}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Jolene reviews agent runs, blockers, pipeline state, Email Operations, market signals, LinkedIn signals, and the career standup before proposing delegated work.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
              <ActionButton postTo="/api/jolene/operating-loop/run" variant="contained" size="small" loadingLabel="Planning...">
                Run Operating Loop
              </ActionButton>
              <ActionButton postTo="/api/jolene/chief-of-staff/run" variant="outlined" size="small" loadingLabel="Briefing...">
                Run Brief
              </ActionButton>
              <ActionButton href="/agents" variant="outlined" size="small" endIcon={<OpenInNewIcon />}>
                Agent Board
              </ActionButton>
            </Stack>
          </Stack>

          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 850 }}>Operating Loop</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {operatingLoop
                      ? `${operatingLoop.summary} Last run ${new Date(operatingLoop.generatedAt).toLocaleString()}.`
                      : "No operating loop run yet. Run it to let Jolene monitor signals, refresh the brief, and prepare approval cards."}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" variant="outlined" label={operatingLoop ? operatingLoop.autonomyPolicy.replace(/_/g, " ") : "propose first"} />
                  {operatingLoop ? <Chip size="small" variant="outlined" label={`${operatingLoop.approvalRequests.length} approval needed`} /> : null}
                  {operatingLoop ? <Chip size="small" variant="outlined" label={`${operatingLoop.skippedActions.length} skipped`} /> : null}
                </Stack>
              </Stack>
              {nextLoopAction ? (
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Next recommended action</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{nextLoopAction.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{nextLoopAction.reason}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                    <ActionButton href={nextLoopAction.href} variant="outlined" size="small">Open</ActionButton>
                    {operatingLoopRunId ? (
                      <ActionButton
                        postTo="/api/jolene/operating-loop/approve"
                        body={{ runId: operatingLoopRunId, proposalIds: [nextLoopAction.id] }}
                        variant="contained"
                        size="small"
                        loadingLabel="Approving..."
                      >
                        Approve
                      </ActionButton>
                    ) : null}
                  </Stack>
                </Stack>
              ) : null}
            </Stack>
          </Box>

          {emailEvidence ? (
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", p: 1.5 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 850 }}>Email Operations</Typography>
                  <Typography variant="caption" color="text.secondary">{emailEvidence}</Typography>
                </Box>
                <ActionButton href="/dashboard/email-ops" size="small" variant="outlined">Open Email Ops</ActionButton>
              </Stack>
            </Box>
          ) : null}

          {topPriorities.length ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
              {topPriorities.map((priority) => {
                const proposal = priority.delegatedActionId ? proposalsByAction.get(priority.delegatedActionId) : null;
                return (
                  <Box key={priority.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", p: 1.5 }}>
                    <Stack spacing={1.25}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Chip size="small" variant="outlined" label={`P${priority.priority}`} />
                        <Chip size="small" variant="outlined" label={priority.category.replace(/_/g, " ")} />
                      </Stack>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>{priority.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{priority.detail}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">Why: {priority.rationale}</Typography>
                      <Stack spacing={0.5}>
                        {priority.evidence.slice(0, 2).map((item) => (
                          <Typography key={item} variant="caption" color="text.secondary">Evidence: {item}</Typography>
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                        <ActionButton href={priority.href} variant="outlined" size="small">Open</ActionButton>
                        {proposal && runId ? (
                          <ActionButton
                            postTo="/api/jolene/chief-of-staff/approve"
                            body={{ runId, proposalIds: [proposal.id] }}
                            variant="contained"
                            size="small"
                            loadingLabel="Approving..."
                          >
                            Approve
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          postTo="/api/jolene"
                          body={{ contextPath: "/dashboard", message: `Explain this Jolene Chief of Staff priority: ${priority.title}` }}
                          variant="text"
                          size="small"
                          loadingLabel="Asking..."
                        >
                          Ask Jolene
                        </ActionButton>
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <EmptyState title="No Jolene brief yet" body="Run a brief to let Jolene inspect agent activity and propose the next operating priorities." />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export async function DashboardSearchPage() {
  const [latestRun, needsReview] = await Promise.all([
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.jobProfileMatch.findMany({
      where: { status: "needs_review", jobPosting: { applications: { none: { status: { in: submittedApplicationStatuses } } } } },
      include: { jobPosting: true, jobSearchProfile: { select: { name: true, userId: true } } },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);
  const suppressionStates = await loadJobSuppressionStatesByUserIds(needsReview.map((match) => match.jobSearchProfile.userId));
  const visibleNeedsReview = uniqueMatchesByCanonicalJob(needsReview.filter((match) => {
    const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
    return !suppressionState || !isJobSuppressed(match.jobPosting, suppressionState);
  })).slice(0, 12);

  return (
    <DashboardShell group="search">
      <SearchRunCommandCenter initialRun={latestRun ? serializeSearchRun(latestRun) : null} />
      <AgencyActivityCard />
      <ExceptionReview matches={visibleNeedsReview} />
    </DashboardShell>
  );
}

export async function DashboardSocialPage() {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  const linkedInAnalyticsSummary = user ? await getLinkedInAnalyticsSummary(user.id, "30d") : null;

  return (
    <DashboardShell group="social">
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">LinkedIn content loop</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Post analytics feed aggregate performance back into the agent content memory pack for better future drafts.
              </Typography>
            </Box>
            <Button component={Link} href="/linkedin-content" variant="contained">Open LinkedIn Content</Button>
          </Stack>
        </CardContent>
      </Card>
      <LinkedInAnalyticsCard initialSummary={linkedInAnalyticsSummary} />
    </DashboardShell>
  );
}

export async function DashboardEmailOpsPage() {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  const emailOps = user ? await getLatestEmailOpsSummary(user.id) : null;
  const summary = emailOps?.summary ?? null;
  const findings = emailOps?.findings ?? [];
  const pendingFindings = findings.filter((finding) => finding.status === "NEEDS_APPROVAL");
  const autoAppliedFindings = findings.filter((finding) => finding.status === "AUTO_APPLIED");
  const calendarDrafts = emailOps?.pendingCalendarProposals ?? [];

  return (
    <DashboardShell group="email">
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography variant="h3">Jolene Email Operations</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Inbox specialists scan job-response mail, suppress alerts and junk, update high-confidence internal outcomes, and draft calendar work for approval.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last run: {emailOps?.latestRun ? emailOps.latestRun.createdAt.toLocaleString() : "No Email Ops run yet"}
              </Typography>
            </Box>
            <ActionButton postTo="/api/jolene/email-ops/run" variant="contained" loadingLabel="Scanning...">Run Email Ops</ActionButton>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" }, gap: 2 }}>
        <Metric label="Messages scanned" value={(summary?.scanned ?? 0).toString()} helper="Latest Email Ops run" />
        <Metric label="Findings" value={(summary?.findingsCreated ?? findings.length).toString()} helper="Durable inbox intelligence" />
        <Metric label="Suppressed" value={(summary?.suppressed ?? 0).toString()} helper="Junk, alerts, and no-action mail" />
        <Metric label="Auto-applied" value={(summary?.autoApplied ?? autoAppliedFindings.length).toString()} helper="High-confidence internal updates" />
        <Metric label="Needs approval" value={(summary?.needsApproval ?? pendingFindings.length).toString()} helper="Actionable job-response items" />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.15fr) minmax(0, 0.85fr)" }, gap: 2, alignItems: "start" }}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <SectionTitle title="Recent Findings" />
              {findings.length ? (
                <Stack spacing={1.5}>
                  {findings.slice(0, 12).map((finding) => {
                    const evidence = jsonStringArray(finding.evidenceJson).slice(0, 2);
                    const role = finding.matchedApplication?.jobPosting ?? finding.matchedJobPosting;
                    return (
                      <Box key={finding.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                            <Chip size="small" label={finding.status.replace(/_/g, " ")} color={finding.status === "NEEDS_APPROVAL" ? "warning" : finding.status === "AUTO_APPLIED" ? "success" : "default"} />
                            <Chip size="small" variant="outlined" label={finding.classification.replace(/_/g, " ")} />
                            <Chip size="small" variant="outlined" label={`${finding.confidenceScore}%`} />
                          </Stack>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 850 }}>{finding.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{role ? `${role.company} - ${role.title}` : "No safe application match yet"}</Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary">{finding.summary}</Typography>
                          {finding.reviewReason ? <Typography variant="caption" color="warning.main">Review: {finding.reviewReason}</Typography> : null}
                          {evidence.map((item) => (
                            <Typography key={item} variant="caption" color="text.secondary">Evidence: {item}</Typography>
                          ))}
                          {finding.status === "NEEDS_APPROVAL" ? (
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                              <ActionButton postTo={`/api/jolene/email-ops/findings/${finding.id}/approve`} size="small" variant="contained" loadingLabel="Approving...">Approve</ActionButton>
                              <ActionButton postTo={`/api/jolene/email-ops/findings/${finding.id}/dismiss`} size="small" variant="outlined" loadingLabel="Dismissing...">Dismiss</ActionButton>
                            </Stack>
                          ) : null}
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <EmptyState title="No actionable Email Ops findings" body="Run Email Ops to scan Primary and Updates job-response mail while suppressing alerts, newsletters, and promotions." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SectionTitle title="Calendar Drafts" />
                {calendarDrafts.length ? (
                  <Stack spacing={1}>
                    {calendarDrafts.slice(0, 8).map((proposal) => (
                      <Box key={proposal.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>{proposal.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{proposal.sourceSummary}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {proposal.meetingUrl ? `Meeting link found: ${proposal.meetingUrl}` : "No meeting link extracted yet"}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <EmptyState title="No calendar drafts" body="Interview invites, assessments, and scheduling requests create in-app drafts before any external calendar write." />
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <SectionTitle title="Safety Policy" />
                <Typography variant="body2" color="text.secondary">Auto-applies only high-confidence internal updates such as clear rejections and application confirmations.</Typography>
                <Typography variant="body2" color="text.secondary">Replies, offers, ambiguous matches, employer contact, and external calendar writes stay approval-gated.</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </DashboardShell>
  );
}

export async function DashboardMarketPage() {
  const [latestMarketRuns, latestManualSearchRun, latestCronSearchRun, profiles] = await Promise.all([
    prisma.agentRun.findMany({ where: { agentType: "MARKET_INTELLIGENCE", status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.jobSearchRun.findFirst({ where: { triggeredBy: "manual" }, orderBy: { startedAt: "desc" } }),
    prisma.jobSearchRun.findFirst({ where: { triggeredBy: "cron" }, orderBy: { startedAt: "desc" } }),
    prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
  ]);
  const latestMarketRun = latestMarketRuns[0] ?? null;
  const latestMarket = isRecord(latestMarketRun?.outputJson) ? latestMarketRun.outputJson as MarketIntelligenceOutput : null;
  const cronExpression = profiles.find((profile) => profile.cronExpression)?.cronExpression ?? "0 14 * * *";

  return (
    <DashboardShell group="market">
      <MarketAnalysisCard
        latest={latestMarket}
        latestRunCreatedAt={latestMarketRun?.createdAt ?? null}
        trendSeries={buildMarketTrendSeries(latestMarketRuns.map((run) => run.outputJson))}
        searchHealth={{
          latestManualSearchAt: latestManualSearchRun?.startedAt ?? null,
          latestCronSearchAt: latestCronSearchRun?.startedAt ?? null,
          cronExpression,
          scheduledProfileCount: profiles.filter((profile) => profile.scheduleEnabled).length,
        }}
      />
    </DashboardShell>
  );
}

export async function DashboardPipelinePage() {
  const [profiles, applicationStatusCounts, readyApplicationCount, approvedApplicationCount, needsReview, latestDailyPlanRun, agentUserRequests, integrityReport] = await Promise.all([
    prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.application.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.application.count({ where: { status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } } }),
    prisma.application.count({ where: { status: "approved" } }),
    prisma.jobProfileMatch.findMany({
      where: { status: "needs_review", jobPosting: { applications: { none: { status: { in: submittedApplicationStatuses } } } } },
      include: { jobPosting: true, jobSearchProfile: { select: { userId: true } } },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.agentRun.findFirst({ where: { agentType: "DAILY_COMMAND_CENTER", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
    listOpenAgentUserRequests(5),
    auditApplicationIntegrity().catch(() => null),
  ]);
  const suppressionStates = await loadJobSuppressionStatesByUserIds(needsReview.map((match) => match.jobSearchProfile.userId));
  const needsReviewCount = uniqueMatchesByCanonicalJob(needsReview.filter((match) => {
    const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
    return !suppressionState || !isJobSuppressed(match.jobPosting, suppressionState);
  })).length;
  const dailyPlan = filterDailyPlanForCurrentState(dailyPlanOutput(latestDailyPlanRun?.outputJson), { approvedApplications: approvedApplicationCount, needsReview: needsReviewCount, readyToApply: readyApplicationCount });
  const applicationCountByStatus = new Map(applicationStatusCounts.map((count) => [count.status, count._count.status]));

  return (
    <DashboardShell group="pipeline">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 0.9fr) minmax(0, 1.1fr)" }, gap: 2, alignItems: "start" }}>
        <Stack spacing={2}>
          <BlockersCard agentUserRequests={agentUserRequests} />
          <IntegrityCard integrityReport={integrityReport} />
          <DailyPlanCard dailyPlan={dailyPlan} />
        </Stack>
        <Stack spacing={2}>
          <PipelineCard applicationCountByStatus={applicationCountByStatus} needsReviewCount={needsReviewCount} />
          <ProfileHealthCard profiles={profiles} />
          <ActionButton href="/jobs?statusView=archived" variant="outlined">View archived jobs</ActionButton>
        </Stack>
      </Box>
    </DashboardShell>
  );
}

function DashboardRouteNav({ activeGroup }: { activeGroup: DashboardRouteGroup }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: "background.default" }}>
      <CardContent sx={{ py: "10px !important" }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mr: 0.5, whiteSpace: "nowrap" }}>
            Command Center:
          </Typography>
          {DASHBOARD_ROUTES.map((section) => (
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

function AgencyActivityCard() {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
              <Chip size="small" color="primary" label="Recruiting agency" />
              <Chip size="small" variant="outlined" label="Auto-runs after search" />
            </Stack>
            <Typography variant="h3">Agency activity</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              After search saves eligible matches, the agency prepares packets for Apply Sprint automatically. Unusable or uncertain jobs remain as exceptions below.
            </Typography>
          </Box>
          <AgencyRunControl label="Run agency now" minimumScore={0} variant="outlined" showLatestOnMount />
        </Stack>
      </CardContent>
    </Card>
  );
}

function ExceptionReview({ matches }: { matches: Array<any> }) {
  return (
    <Stack spacing={2}>
      <SectionTitle title="Exception Review" />
      {matches.length === 0 ? (
        <Card><EmptyState title="No exceptions waiting" body="Run a search and eligible matches will be prepared for Apply Sprint automatically. Admin exceptions will appear here." /></Card>
      ) : matches.map((match) => (
        <Card key={match.id} sx={{ transition: "border-color 160ms ease, transform 160ms ease", "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" } }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", minWidth: 0 }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <ScoreChip score={match.overallScore} label={`${match.overallScore} score`} />
                    <Chip variant="outlined" label={match.jobSearchProfile.name} />
                  </Stack>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h2" sx={{ overflowWrap: "anywhere" }}>{match.jobPosting.title}</Typography>
                    <Typography color="text.secondary">{match.jobPosting.company} · {match.jobPosting.location ?? "Unknown location"}</Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexShrink: 0 }}>
                  <JobRejectButton jobId={match.jobPosting.id} matchId={match.id} label={`${match.jobPosting.company} - ${match.jobPosting.title}`} variant="outlined" color="secondary" source="dashboard_reject" />
                  <ActionButton postTo={`/api/jobs/${match.jobPosting.id}/approve`} body={{ matchId: match.id }} variant="contained">Approve</ActionButton>
                </Stack>
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                <SignalList title="Why it matched" items={jsonArray(match.strongestMatches)} color="success" />
                <SignalList title="Concerns" items={jsonArray(match.concerns)} color="warning" />
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Typography variant="body2" color="text.secondary">
                  Recommended action: <Box component="span" sx={{ fontWeight: 800, color: "text.primary" }}>{match.recommendedAction}</Box>
                </Typography>
                <ActionButton href={`/jobs/${match.jobPosting.id}`} size="small" endIcon={<OpenInNewIcon />}>Open job</ActionButton>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function BlockersCard({ agentUserRequests }: { agentUserRequests: Awaited<ReturnType<typeof listOpenAgentUserRequests>> }) {
  return (
    <Card sx={{ borderColor: agentUserRequests.length ? "warning.main" : "divider" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
            <Box>
              <Typography variant="h3">Blockers</Typography>
              <Typography variant="body2" color="text.secondary">Hard blockers and sensitive approvals.</Typography>
            </Box>
            <ActionButton href="/needs-me" variant={agentUserRequests.length ? "contained" : "outlined"} color={agentUserRequests.length ? "warning" : "primary"} size="small">
              {agentUserRequests.length ? `Review ${agentUserRequests.length}` : "Open"}
            </ActionButton>
          </Stack>
          {agentUserRequests.length ? (
            <Stack spacing={1}>
              {agentUserRequests.slice(0, 3).map((request) => {
                const job = request.application?.jobPosting ?? request.jobPosting;
                return (
                  <Box key={request.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                    <Stack spacing={0.75}>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                        <Chip size="small" color="warning" variant="outlined" label={agentUserRequestTypeLabel(request.type)} />
                        {job ? <Chip size="small" variant="outlined" label={job.company} /> : null}
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{request.question}</Typography>
                      <ActionButton href={agentUserRequestHref(request)} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function IntegrityCard({ integrityReport }: { integrityReport: Awaited<ReturnType<typeof auditApplicationIntegrity>> | null }) {
  return (
    <Card sx={{ borderColor: integrityReport?.totalIssues ? "warning.main" : "success.main" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color={integrityReport?.totalIssues ? "warning" : "success"} label={integrityReport?.totalIssues ? "Drift detected" : "Synced"} />
                <Chip size="small" variant="outlined" label={`${integrityReport?.totalIssues ?? 0} issues`} />
              </Stack>
              <Typography variant="h3">State integrity</Typography>
              <Typography variant="body2" color="text.secondary">Canonical application, match, email, and assistant state.</Typography>
            </Box>
            <ActionButton postTo="/api/applications/integrity/repair" variant={integrityReport?.totalIssues ? "contained" : "outlined"} color={integrityReport?.totalIssues ? "warning" : "success"} size="small" loadingLabel="Repairing...">
              Repair
            </ActionButton>
          </Stack>
          {integrityReport?.issues.length ? (
            <Stack spacing={1}>
              {integrityReport.issues.slice(0, 3).map((issue) => (
                <Box key={`${issue.kind}-${issue.applicationId ?? issue.jobProfileMatchId ?? issue.jobPostingId}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{issue.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{issue.detail}</Typography>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function DailyPlanCard({ dailyPlan }: { dailyPlan: DailyPlanOutput | null }) {
  return (
    <Card sx={{ borderColor: "primary.light" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
            <Box>
              <Typography variant="h3">Daily Plan</Typography>
              <Typography variant="body2" color="text.secondary">{dailyPlan?.summary ?? "Generate a prioritized plan from current jobs and applications."}</Typography>
              {dailyPlan?.generatedAt ? <Typography variant="caption" color="text.secondary">Generated {formatDateTime(dailyPlan.generatedAt)}</Typography> : null}
            </Box>
            <RunDailyPlanButton />
          </Stack>
          {dailyPlan?.actions?.length ? (
            <Stack spacing={1}>
              {dailyPlan.actions.slice(0, 3).map((action) => (
                <Box key={`${action.priority}-${action.title}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                  <Stack spacing={0.75}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Chip size="small" color="primary" variant="outlined" label={`P${action.priority}`} />
                      {typeof action.count === "number" ? <Chip size="small" label={action.count} /> : null}
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 850 }}>{action.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{action.detail}</Typography>
                    <ActionButton href={action.href} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function PipelineStatusSummary({ applicationCountByStatus, needsReviewCount, blockers }: { applicationCountByStatus: Map<string, number>; needsReviewCount: number; blockers: number }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
      <Metric label="Open blockers" value={blockers.toString()} helper="Needs Me requests" />
      <Metric label="Applied" value={(applicationCountByStatus.get("applied") ?? 0).toString()} helper="Submitted applications" />
      <Metric label="Review queue" value={needsReviewCount.toString()} helper="Search exceptions" />
    </Box>
  );
}

function PipelineCard({ applicationCountByStatus, needsReviewCount }: { applicationCountByStatus: Map<string, number>; needsReviewCount: number }) {
  return (
    <>
      <SectionTitle title="Pipeline" />
      <Card>
        <List disablePadding>
          {["needs_review", "approved", "ready_to_apply", "applied", "follow_up_due", "archived"].map((status, index, statuses) => (
            <ListItem key={status} divider={index < statuses.length - 1} secondaryAction={<Chip size="small" label={status === "needs_review" ? needsReviewCount : applicationCountByStatus.get(status) ?? 0} />} sx={{ py: 1.5 }}>
              <ListItemText
                primary={formatStatus(status)}
                secondary="Application workflow status"
                slotProps={{ primary: { sx: { fontWeight: 800, fontSize: 14, textTransform: "capitalize" } }, secondary: { variant: "caption", color: "text.secondary" } }}
              />
            </ListItem>
          ))}
        </List>
      </Card>
    </>
  );
}

function ProfileHealthCard({ profiles }: { profiles: Array<{ id: string; name: string; minimumMatchScore: number }> }) {
  return (
    <>
      <SectionTitle title="Profile Health" />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            {profiles.map((profile) => (
              <Box key={profile.id}>
                <Stack direction="row" sx={{ justifyContent: "space-between" }} spacing={2}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{profile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{profile.minimumMatchScore}</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={profile.minimumMatchScore} sx={{ mt: 1, height: 8, borderRadius: 4 }} />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}

function dailyPlanOutput(value: unknown): DailyPlanOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DailyPlanOutput : null;
}

function joleneChiefOutput(value: unknown): JoleneChiefOutput | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.priorities) || !Array.isArray(value.delegatedWork)) return null;
  return value as JoleneChiefOutput;
}

function joleneOperatingLoopOutput(value: unknown): JoleneOperatingLoopOutput | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.recommendedActions) || !Array.isArray(value.skippedActions) || !Array.isArray(value.approvalRequests)) return null;
  return value as JoleneOperatingLoopOutput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildMarketTrendSeries(values: unknown[]): MarketTrendPoint[] {
  const points: MarketTrendPoint[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const output = value as Partial<MarketIntelligenceOutput>;
    const generatedAt = typeof output.generatedAt === "string" ? output.generatedAt : null;
    if (!generatedAt) continue;
    const topLane = output.marketTemperature?.[0];
    const topSkill = output.skillSignals?.[0];
    points.push({
      generatedAt,
      label: new Date(generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      topLane: topLane?.lane ?? "No lane",
      topLaneJobs: topLane?.jobCount ?? 0,
      topSkill: topSkill?.skill ?? "No skill",
      topSkillMentions: topSkill?.mentions ?? 0,
      confidencePercent: Math.round((output.confidence ?? 0) * 100),
    });
  }
  return points.reverse();
}

function filterDailyPlanForCurrentState(plan: DailyPlanOutput | null, { approvedApplications, needsReview, readyToApply }: { approvedApplications: number; needsReview: number; readyToApply: number }): DailyPlanOutput | null {
  if (!plan?.actions?.length) return plan;
  return {
    ...plan,
    actions: plan.actions.filter((action) => {
      if (action.category === "submit_applications") return readyToApply > 0;
      if (action.category === "review_jobs") return needsReview > 0;
      if (action.category === "prepare_packets") return approvedApplications > 0;
      return true;
    }),
  };
}

function serializeSearchRun(run: {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress: unknown;
}) {
  return {
    id: run.id,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    jobsFetched: run.jobsFetched,
    jobsAfterDedupe: run.jobsAfterDedupe,
    jobsAfterFilters: run.jobsAfterFilters,
    jobsSaved: run.jobsSaved,
    progress: Array.isArray(run.progress) ? run.progress as Array<{ at: string; message: string; stats?: { jobsFetched?: number; jobsAfterDedupe?: number; jobsAfterFilters?: number; jobsSaved?: number } }> : [],
  };
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h1" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
      <Typography variant="h3">{title}</Typography>
    </Stack>
  );
}

function SignalList({ title, items, color }: { title: string; items: string[]; color: "success" | "warning" }) {
  const visibleItems = items.slice(0, 3);
  const overflowCount = Math.max(0, items.length - visibleItems.length);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{title}</Typography>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
        {items.length === 0 ? <Chip size="small" variant="outlined" label="None" /> : visibleItems.map((item) => (
          <Chip key={`${title}-${item}`} size="small" color={color} variant="outlined" label={item} sx={{ maxWidth: 180, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />
        ))}
        {overflowCount ? <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", fontWeight: 800 }}>+{overflowCount}</Typography> : null}
      </Stack>
    </Box>
  );
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}
