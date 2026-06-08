export const metadata = {
  title: "Applications | Job Search OS",
  description: "Track approved, ready, submitted, and outcome-bearing applications.",
};

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import Link from "next/link";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { AgencyRunControl } from "@/components/agency-run-control";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip, formatStatus } from "@/components/ui/status-chip";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { reconcileApplicationCanonicalState, visibleCanonicalApplications } from "@/lib/applications/reconciliation";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { ApplicationDeleteButton } from "./application-delete-button";
import { BackfillPacketsButton } from "./backfill-packets-button";
import { BulkMoveToSprintControl } from "./bulk-move-to-sprint-control";
import { MarkAppliedButton } from "./mark-applied-button";

export const dynamic = "force-dynamic";

const columns = ["approved", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer", "archived"];
const commandButtonSx = {
  minHeight: 42,
  width: "100%",
  justifyContent: "flex-start",
  textAlign: "left",
};

export default async function ApplicationsPage() {
  await reconcileApplicationCanonicalState({ source: "applications_page" }).catch(() => null);
  const [applications, rawAgencyMatches, emailConnection] = await Promise.all([
    prisma.application.findMany({
      include: {
        jobPosting: true,
        resume: true,
        coverLetter: true,
        applicationPackets: { take: 1 },
        emailMessages: {
          where: { classification: "AUTOMATED_CONFIRMATION" },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
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
      take: 250,
    }),
    prisma.emailOAuthConnection.findFirst({ select: { id: true } }),
  ]);
  const visibleApplications = visibleCanonicalApplications(applications);
  const suppressionStates = await loadJobSuppressionStatesByUserIds(rawAgencyMatches.map((match) => match.jobSearchProfile.userId));
  const trackedJobKeys = applicationJobKeySet(visibleApplications);
  const agencyCandidates = uniqueMatchesByCanonicalJob(
    rawAgencyMatches.filter((match) => {
      const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
      return !hasApplicationForJob(match.jobPosting, trackedJobKeys) && (!suppressionState || !isJobSuppressed(match.jobPosting, suppressionState));
    }),
  );
  const nextAction = applicationsNextAction({
    approvedCount: visibleApplications.filter((application) => application.status === "approved").length,
    readyCount: visibleApplications.filter((application) => application.status === "ready_to_apply").length,
    agencyCandidateCount: agencyCandidates.length,
  });

  const fallbacks = getServiceFallbacks(["openai", "email_sync"], {
    anyEmailSyncConnected: Boolean(emailConnection),
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application control"
          title="Apply Sprint"
          description="Work the applications the agency has approved and prepared. The assistant helps fill forms, but final submission stays under your control."
        />
        <ServiceFallbackBanners items={fallbacks} />
        <Card sx={{ borderColor: nextAction.color === "success" ? "success.main" : "primary.main", bgcolor: nextAction.color === "success" ? "rgba(16, 185, 129, 0.08)" : "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next action" />
                  {typeof nextAction.count === "number" ? <Chip size="small" variant="outlined" label={nextAction.count} /> : null}
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              {nextAction.postTo === "/api/applications/agency/run" ? (
                <Box sx={{ minWidth: { md: 360 } }}>
                  <AgencyRunControl label={nextAction.label} color="primary" showLatestOnMount={false} />
                </Box>
              ) : (
                <ActionButton
                  href={nextAction.href}
                  postTo={nextAction.postTo}
                  body={nextAction.body}
                  runInBackground={nextAction.runInBackground}
                  variant="contained"
                  color={nextAction.color}
                  startIcon={nextAction.icon}
                  loadingLabel={nextAction.loadingLabel}
                >
                  {nextAction.label}
                </ActionButton>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h3">Agency command center</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 780 }}>
                  Run the agency, prepare approved packets, and launch the next application from one focused control surface.
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "minmax(360px, 1.25fr) minmax(320px, 0.75fr)" },
                  gap: 2,
                  alignItems: "start",
                }}
              >
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
                  <Stack spacing={1.5}>
                    <Box>
                      <Chip size="small" color="primary" label="Primary workflow" />
                      <Typography variant="h4" sx={{ mt: 1 }}>Recruiting agency</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Review high-fit matches, approve the right jobs, and generate application packets.
                      </Typography>
                    </Box>
                    <AgencyRunControl buttonSx={{ minHeight: 44, px: 2.25 }} />
                  </Stack>
                </Box>
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
                  <Stack spacing={1.5}>
                    <Box>
                      <Chip size="small" variant="outlined" label="Actions" />
                      <Typography variant="h4" sx={{ mt: 1 }}>Application operations</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Prepare, inspect, recover, or launch the next ready item.
                      </Typography>
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 1.25 }}>
                      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                          Move approved applications into Apply Sprint
                        </Typography>
                        <BulkMoveToSprintControl buttonSx={commandButtonSx} />
                      </Box>
                      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                          Prepare high-score approved matches
                        </Typography>
                        <BulkPrepareControl compact defaultMinimumScore={90} defaultLimit={10} buttonSx={commandButtonSx} />
                      </Box>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                        <BackfillPacketsButton sx={commandButtonSx} />
                        <ActionButton href="/applications/assistant" variant="outlined" startIcon={<BoltOutlinedIcon />} sx={commandButtonSx}>
                          Open sprint console
                        </ActionButton>
                        <ActionButton
                          postTo="/api/applications/next-ready/launch-assistant"
                          variant="contained"
                          color="success"
                          startIcon={<PlayCircleOutlineOutlinedIcon />}
                          sx={commandButtonSx}
                        >
                          Launch next ready
                        </ActionButton>
                      </Box>
                    </Box>
                  </Stack>
                </Box>
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 2 }}>
          {columns.map((status) => {
            const items = visibleApplications.filter((application) => application.status === status);
            return (
              <Card key={status} sx={{ minHeight: 220 }}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <StatusChip status={status} />
                    <Chip label={items.length} sx={{ fontVariantNumeric: "tabular-nums" }} />
                  </Stack>
                  <Stack spacing={1.5} sx={{ mt: 2 }}>
                    {items.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">No {formatStatus(status)} applications.</Typography>
                    ) : (
                      items.map((application) => (
                        <Box key={application.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                          <Typography sx={{ fontWeight: 800 }}>{application.jobPosting.title}</Typography>
                          <Typography variant="body2" color="text.secondary">{application.jobPosting.company}</Typography>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                            {application.resume ? <Chip size="small" color="success" variant="outlined" label="Resume" /> : null}
                            {application.coverLetter ? <Chip size="small" color="secondary" variant="outlined" label="Cover letter" /> : null}
                            {application.applicationPackets.length ? <Chip size="small" color="primary" variant="outlined" label="Packet" /> : null}
                            {application.emailMessages.length ? <Chip size="small" color="success" label="Received" /> : null}
                          </Stack>
                          <Box sx={{ mt: 1 }}>
                            <ActionButton href={`/applications/${application.id}`} size="small" variant="outlined" startIcon={<FactCheckOutlinedIcon />}>
                              Review packet
                            </ActionButton>
                          </Box>
                          {application.status === "ready_to_apply" && application.resume && application.coverLetter ? (
                            <Box sx={{ mt: 1 }}>
                              <Button
                                component={Link}
                                href={`/applications/assistant?applicationId=${application.id}`}
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<BoltOutlinedIcon />}
                              >
                                Open in Apply Sprint
                              </Button>
                            </Box>
                          ) : null}
                          {application.jobPosting.applicationUrl ? (
                            <Button
                              component={Link}
                              href={application.jobPosting.applicationUrl}
                              target="_blank"
                              rel="noreferrer"
                              size="small"
                              variant="outlined"
                              sx={{ mt: 1 }}
                            >
                              Open application
                            </Button>
                          ) : null}
                          {application.status === "approved" || application.status === "ready_to_apply" ? (
                            <Box sx={{ mt: 1 }}>
                              <ApplicationDeleteButton
                                applicationId={application.id}
                                label={`${application.jobPosting.company} - ${application.jobPosting.title}`}
                              />
                            </Box>
                          ) : null}
                          {application.status === "ready_to_apply" && application.resume && application.coverLetter ? (
                            <>
                              <Divider sx={{ my: 1.25 }} />
                              <Stack spacing={0.75}>
                                <ActionButton
                                  postTo={`/api/applications/${application.id}/launch-assistant`}
                                  message="Local assistant launched. Review the browser window and submit manually."
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={<PlayCircleOutlineOutlinedIcon />}
                                >
                                  Launch assistant
                                </ActionButton>
                                <MarkAppliedButton applicationId={application.id} />
                                <Typography variant="caption" color="text.secondary">
                                  Launch the assistant, review the employer form, then mark this item applied after submission.
                                </Typography>
                              </Stack>
                            </>
                          ) : null}
                        </Box>
                      ))
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
        {visibleApplications.length === 0 ? (
          <Card>
            <EmptyState title="No applications tracked" body="Run search from the Dashboard. Strong matches will flow through the recruiting agency into prepared application packets." />
          </Card>
        ) : null}
      </Stack>
    </AppShell>
  );
}

function applicationsNextAction({ approvedCount, readyCount, agencyCandidateCount }: { approvedCount: number; readyCount: number; agencyCandidateCount: number }) {
  if (readyCount > 0) {
    return {
      title: "Work Apply Sprint",
      detail: "Ready applications have resume and cover letter materials. Open the sprint console to launch the assistant and track submission.",
      label: "Open sprint console",
      href: "/applications/assistant",
      color: "success" as const,
      icon: <BoltOutlinedIcon />,
      count: readyCount,
    };
  }
  if (agencyCandidateCount > 0) {
    return {
      title: "Run the recruiting agency",
      detail: "Strong 90+ matches are waiting. Let the agency approve them, create trackers, and generate application packets.",
      label: "Run agency",
      postTo: "/api/applications/agency/run",
      body: { minimumScore: 90, limit: 50, triggeredBy: "manual" },
      runInBackground: true,
      loadingLabel: "Agency running...",
      color: "primary" as const,
      icon: <AutoAwesomeOutlinedIcon />,
      count: agencyCandidateCount,
    };
  }
  if (approvedCount > 0) {
    return {
      title: "Move approved applications to Apply Sprint",
      detail: "Approved applications need packets and ready status before the assistant can work them.",
      label: "Bulk move to sprint",
      postTo: "/api/applications/bulk-move-to-sprint",
      body: { limit: Math.min(Math.max(approvedCount, 1), 50) },
      runInBackground: true,
      loadingLabel: "Moving...",
      color: "primary" as const,
      icon: <BoltOutlinedIcon />,
      count: approvedCount,
    };
  }
  return {
    title: "Review jobs first",
    detail: "No application work is ready. Approve strong job matches, then return here to generate packets.",
    label: "Review jobs",
    href: "/jobs",
    color: "primary" as const,
    icon: <FactCheckOutlinedIcon />,
  };
}
