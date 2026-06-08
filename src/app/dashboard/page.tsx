import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { AgencyRunControl } from "@/components/agency-run-control";
import { JobRejectButton } from "@/components/job-reject-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchRunCommandCenter } from "@/components/search-run-command-center";
import { ScoreChip } from "@/components/ui/score-chip";
import { formatStatus } from "@/components/ui/status-chip";
import { agentUserRequestHref, agentUserRequestTypeLabel, listOpenAgentUserRequests } from "@/lib/agent-user-requests";
import { auditApplicationIntegrity } from "@/lib/applications/integrity";
import { applicationJobKeySet, hasApplicationForJob, submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { RunDailyPlanButton } from "./daily-plan-card";

export const dynamic = "force-dynamic";

type DailyPlanOutput = {
  generatedAt?: string;
  summary?: string;
  actions?: Array<{
    priority: number;
    category: string;
    title: string;
    detail: string;
    href: string;
    count?: number;
  }>;
  blockers?: string[];
  confidence?: number;
  rationale?: string;
};

export default async function DashboardPage() {
  const [profiles, latestRun, applicationStatusCounts, readyApplicationCount, approvedApplicationCount, needsReview, trackedApplicationsForAgency, agencyCandidateMatches, latestDailyPlanRun, agentUserRequests, integrityReport, notificationSettings] = await Promise.all([
    prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.application.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.application.count({ where: { status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } } }),
    prisma.application.count({ where: { status: "approved" } }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: "needs_review",
        jobPosting: {
          applications: {
            none: {
              status: { in: submittedApplicationStatuses },
            },
          },
        },
      },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true, userId: true } },
      },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.application.findMany({
      select: {
        status: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: "needs_review",
        overallScore: { gte: 90 },
        jobPosting: {
          applicationUrl: { not: null },
        },
      },
      include: { jobPosting: true, jobSearchProfile: { select: { userId: true } } },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.agentRun.findFirst({
      where: { agentType: "DAILY_COMMAND_CENTER", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    listOpenAgentUserRequests(5),
    auditApplicationIntegrity().catch(() => null),
    prisma.user.findFirst({ select: { notificationSettings: true } }),
  ]);
  const suppressionStates = await loadJobSuppressionStatesByUserIds([
    ...needsReview.map((match) => match.jobSearchProfile.userId),
    ...agencyCandidateMatches.map((match) => match.jobSearchProfile.userId),
  ]);
  const agencyJobKeys = applicationJobKeySet(trackedApplicationsForAgency);
  const agencyCandidateCount = uniqueMatchesByCanonicalJob(
    agencyCandidateMatches.filter((match) => {
      const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
      return !hasApplicationForJob(match.jobPosting, agencyJobKeys) && (!suppressionState || !isJobSuppressed(match.jobPosting, suppressionState));
    }),
  ).length;
  const visibleNeedsReview = uniqueMatchesByCanonicalJob(
    needsReview.filter((match) => {
      const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
      return !suppressionState || !isJobSuppressed(match.jobPosting, suppressionState);
    }),
  ).slice(0, 5);
  const applicationCountByStatus = new Map(applicationStatusCounts.map((count) => [count.status, count._count.status]));
  const readyToApply = readyApplicationCount;
  const needsReviewCount = visibleNeedsReview.length;
  const dailyPlan = filterDailyPlanForCurrentState(dailyPlanOutput(latestDailyPlanRun?.outputJson), {
    approvedApplications: approvedApplicationCount,
    needsReview: needsReviewCount,
    readyToApply,
  });
  const nextAction = getNextAction({
    agentUserRequestCount: agentUserRequests.length,
    dailyPlan,
    readyToApply,
    needsReviewCount,
    agencyCandidateCount,
    latestRunStartedAt: latestRun?.startedAt ?? null,
  });

  const ns = notificationSettings as { pushoverEnabled?: boolean; emailEnabled?: boolean } | null;
  const anyNotificationConfigured = Boolean(ns?.pushoverEnabled || ns?.emailEnabled);
  const fallbacks = getServiceFallbacks(["openai", "brave", "notifications"], {
    anyNotificationConfigured,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Command center"
          title="Agency Command Center"
          description="Run search, watch the recruiting agency approve strong fits, and move prepared applications through Apply Sprint."
          actions={
            <>
            <ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddCircleOutlineIcon />}>Add manual job</ActionButton>
            </>
          }
        />
        <ServiceFallbackBanners items={fallbacks} />

        <Card sx={{ borderColor: nextAction.color === "warning" ? "warning.main" : "primary.main", bgcolor: nextAction.color === "warning" ? "rgba(245, 158, 11, 0.08)" : "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ alignItems: { lg: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next action" />
                  {typeof nextAction.count === "number" ? <Chip size="small" variant="outlined" label={nextAction.count} /> : null}
                </Stack>
                <Typography variant="h2">{nextAction.title}</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              {nextAction.postTo === "/api/applications/agency/run" ? (
                <Box sx={{ minWidth: { lg: 380 } }}>
                  <AgencyRunControl label={nextAction.label} color="primary" showLatestOnMount={false} />
                </Box>
              ) : nextAction.postTo ? (
                <ActionButton
                  postTo={nextAction.postTo}
                  body={nextAction.body}
                  variant="contained"
                  color={nextAction.color}
                  startIcon={nextAction.icon}
                  runInBackground={nextAction.runInBackground}
                  loadingLabel={nextAction.loadingLabel}
                >
                  {nextAction.label}
                </ActionButton>
              ) : (
                <ActionButton href={nextAction.href ?? "/dashboard"} variant="contained" color={nextAction.color} endIcon={<ArrowForwardIcon />}>
                  {nextAction.label}
                </ActionButton>
              )}
            </Stack>
          </CardContent>
        </Card>

        <SearchRunCommandCenter initialRun={latestRun ? serializeSearchRun(latestRun) : null} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 2 }}>
          <Metric label="Enabled profiles" value={profiles.length.toString()} helper="Active campaigns" />
          <Metric label="Exceptions" value={needsReviewCount.toString()} helper="Needs your decision" />
          <Metric label="Ready to apply" value={readyToApply.toString()} helper="Prepared by agency" />
          <Metric label="Latest run" value={latestRun?.status ?? "None"} helper={latestRun ? latestRun.startedAt.toLocaleString() : "No runs yet"} />
        </Box>

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
                  After search saves new strong matches, the agency approves appropriate jobs and prepares packets. Borderline jobs remain as exceptions below.
                </Typography>
              </Box>
              <AgencyRunControl label="Run agency now" variant="outlined" showLatestOnMount />
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1.6fr) minmax(320px, 0.9fr)" }, gap: 2, alignItems: "start" }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack spacing={2}>
              <SectionTitle title="Exception Review" />
              {visibleNeedsReview.length === 0 ? (
                <Card>
                  <EmptyState title="No exceptions waiting" body="Run a search and the agency will approve strong fits automatically. Borderline jobs will appear here." />
                </Card>
              ) : (
                visibleNeedsReview.map((match) => (
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
                            <JobRejectButton
                              jobId={match.jobPosting.id}
                              matchId={match.id}
                              label={`${match.jobPosting.company} - ${match.jobPosting.title}`}
                              variant="outlined"
                              color="secondary"
                              source="dashboard_reject"
                            />
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
                ))
              )}
            </Stack>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Stack spacing={2}>
              <Card sx={{ borderColor: agentUserRequests.length ? "warning.main" : "divider" }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                      <Box>
                        <Typography variant="h3">Needs Me</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Agent blockers.
                        </Typography>
                      </Box>
                      <ActionButton href="/needs-me" variant={agentUserRequests.length ? "contained" : "outlined"} color={agentUserRequests.length ? "warning" : "primary"} size="small">
                        {agentUserRequests.length ? `Review ${agentUserRequests.length}` : "Open"}
                      </ActionButton>
                    </Stack>
                    {agentUserRequests.length ? (
                      <Stack spacing={1}>
                        {agentUserRequests.slice(0, 2).map((request) => {
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
                        <Typography variant="body2" color="text.secondary">
                          Canonical application, match, email, and assistant state.
                        </Typography>
                      </Box>
                      <ActionButton
                        postTo="/api/applications/integrity/repair"
                        variant={integrityReport?.totalIssues ? "contained" : "outlined"}
                        color={integrityReport?.totalIssues ? "warning" : "success"}
                        size="small"
                        loadingLabel="Repairing..."
                      >
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

              <Card sx={{ borderColor: "primary.light" }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                      <Box>
                        <Typography variant="h3">Daily Plan</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {dailyPlan?.summary ?? "Generate a prioritized plan from current jobs and applications."}
                        </Typography>
                        {dailyPlan?.generatedAt ? (
                          <Typography variant="caption" color="text.secondary">
                            Generated {formatDateTime(dailyPlan.generatedAt)}
                          </Typography>
                        ) : null}
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

              <SectionTitle title="Pipeline" />
              <Card>
                <List disablePadding>
                  {["needs_review", "approved", "ready_to_apply", "applied", "follow_up_due", "archived"].map((status, index, statuses) => (
                    <ListItem
                      key={status}
                      divider={index < statuses.length - 1}
                      secondaryAction={<Chip size="small" label={status === "needs_review" ? needsReviewCount : applicationCountByStatus.get(status as never) ?? 0} />}
                      sx={{ py: 1.5 }}
                    >
                      <ListItemText
                        primary={<Typography component="span" sx={{ fontWeight: 800, fontSize: 14, textTransform: "capitalize" }}>{formatStatus(status)}</Typography>}
                        secondary={<Typography component="span" variant="caption" color="text.secondary">Application workflow status</Typography>}
                      />
                    </ListItem>
                  ))}
                </List>
              </Card>

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

              <ActionButton href="/jobs?statusView=archived" variant="outlined">
                View archived jobs
              </ActionButton>
            </Stack>
          </Box>
        </Box>
      </Stack>
    </AppShell>
  );
}

function dailyPlanOutput(value: unknown): DailyPlanOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DailyPlanOutput : null;
}

function filterDailyPlanForCurrentState(
  plan: DailyPlanOutput | null,
  {
    approvedApplications,
    needsReview,
    readyToApply,
  }: {
    approvedApplications: number;
    needsReview: number;
    readyToApply: number;
  },
): DailyPlanOutput | null {
  if (!plan?.actions?.length) return plan;
  const actions = plan.actions.filter((action) => {
    if (action.category === "submit_applications") return readyToApply > 0;
    if (action.category === "review_jobs") return needsReview > 0;
    if (action.category === "prepare_packets") return approvedApplications > 0;
    return true;
  });

  return {
    ...plan,
    actions,
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

function getNextAction({
  agentUserRequestCount,
  dailyPlan,
  readyToApply,
  needsReviewCount,
  agencyCandidateCount,
  latestRunStartedAt,
}: {
  agentUserRequestCount: number;
  dailyPlan: DailyPlanOutput | null;
  readyToApply: number;
  needsReviewCount: number;
  agencyCandidateCount: number;
  latestRunStartedAt: Date | null;
}) {
  if (agentUserRequestCount > 0) {
    return {
      color: "warning" as const,
      title: "Resolve the agent blocker",
      detail: "An agent needs your answer before it can continue the workflow.",
      href: "/needs-me",
      label: "Open Needs Me",
      count: agentUserRequestCount,
    };
  }

  const dailyAction = dailyPlan?.actions?.[0];
  if (dailyAction) {
    return {
      color: "primary" as const,
      title: dailyAction.title,
      detail: dailyAction.detail,
      href: dailyAction.href,
      label: "Start",
      count: dailyAction.count,
    };
  }

  if (readyToApply > 0) {
    return {
      color: "primary" as const,
      title: "Work the Apply Sprint queue",
      detail: "Application materials are ready. Start the assistant on the next ready application.",
      href: "/applications/assistant",
      label: "Open Apply Sprint",
      count: readyToApply,
    };
  }

  if (agencyCandidateCount > 0) {
    return {
      color: "primary" as const,
      title: "Run the recruiting agency",
      detail: "Strong 90+ matches are waiting. Let the agents approve them, create trackers, and generate packets.",
      postTo: "/api/applications/agency/run",
      body: { minimumScore: 90, limit: 50, triggeredBy: "manual" },
      runInBackground: true,
      loadingLabel: "Agency running...",
      icon: <AutoAwesomeOutlinedIcon />,
      label: "Run agency",
      count: agencyCandidateCount,
    };
  }

  if (needsReviewCount > 0) {
    return {
      color: "primary" as const,
      title: "Review agency exceptions",
      detail: "The agency leaves uncertain jobs here when it needs your judgment before approving or rejecting.",
      href: "/jobs",
      label: "Review exceptions",
      count: needsReviewCount,
    };
  }

  const latestRunIsStale = !latestRunStartedAt || Date.now() - latestRunStartedAt.getTime() > 86_400_000;
  return {
    color: "primary" as const,
    title: latestRunIsStale ? "Run job discovery" : "Monitor search and agency",
    detail: latestRunIsStale ? "Refresh discovery; the agency will review strong results after the search finishes." : "Discovery is fresh. Review agency activity or work the exception queue.",
    href: latestRunIsStale ? "/runs" : "/jobs",
    label: latestRunIsStale ? "Run search" : "Open exceptions",
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
          <Chip
            key={`${title}-${item}`}
            size="small"
            color={color}
            variant="outlined"
            label={item}
            sx={{ maxWidth: 180, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
          />
        ))}
        {overflowCount ? (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", fontWeight: 800 }}>
            +{overflowCount}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString();
}
