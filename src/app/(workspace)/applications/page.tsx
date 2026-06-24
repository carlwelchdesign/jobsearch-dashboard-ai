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
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { AgencyRunControl } from "@/components/agency-run-control";
import { EmptyState } from "@/components/ui/empty-state";
import { LifecycleReadinessContext } from "@/components/readiness/lifecycle-context";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip, formatStatus } from "@/components/ui/status-chip";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { classifyApplicationPrepReadiness, type ApplicationPrepReadiness } from "@/lib/applications/prep-readiness";
import { visibleCanonicalApplications } from "@/lib/applications/reconciliation";
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

const columns = ["approved", "material_blocked", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer", "archived"];
const commandButtonSx = {
  minHeight: 42,
  width: "100%",
  justifyContent: "flex-start",
  textAlign: "left",
};

export default async function ApplicationsPage() {
  const [applications, rawAgencyMatches, emailConnection] = await Promise.all([
    prisma.application.findMany({
      select: {
        id: true,
        userId: true,
        jobPostingId: true,
        jobProfileMatchId: true,
        status: true,
        appliedAt: true,
        updatedAt: true,
        createdAt: true,
        notes: true,
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
            duplicateGroupId: true,
            applicationUrl: true,
          },
        },
        resume: { select: { id: true } },
        coverLetter: { select: { id: true, generationNotes: true } },
        applicationPackets: { select: { id: true }, take: 1 },
        emailMessages: {
          where: { classification: "AUTOMATED_CONFIRMATION" },
          select: { id: true },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: "needs_review",
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
  const approvedApplications = visibleApplications.filter((application) => application.status === "approved");
  const approvedReadiness = approvedApplications.map((application) => classifyVisibleApplicationReadiness(application));
  const approvedLaunchableCount = approvedReadiness.filter((readiness) => readiness.kind !== "no_direct_url").length;
  const approvedMissingUrlCount = approvedReadiness.filter((readiness) => readiness.kind === "no_direct_url").length;
  const approvedMissingMaterialsCount = approvedReadiness.filter((readiness) => readiness.kind === "needs_materials").length;
  const approvedMaterialBlockedCount = approvedReadiness.filter((readiness) => readiness.kind === "material_blocked").length;
  const readyLaunchableCount = visibleApplications.filter((application) => (
    application.status === "ready_to_apply"
    && assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable
  )).length;
  const suppressionStates = await loadJobSuppressionStatesByUserIds(rawAgencyMatches.map((match) => match.jobSearchProfile.userId));
  const trackedJobKeys = applicationJobKeySet(visibleApplications);
  const agencyCandidates = uniqueMatchesByCanonicalJob(
    rawAgencyMatches.filter((match) => {
      const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
      return assessApplicationUrlQuality(match.jobPosting.applicationUrl).launchable
        && !hasApplicationForJob(match.jobPosting, trackedJobKeys)
        && (!suppressionState || !isJobSuppressed(match.jobPosting, suppressionState));
    }),
  );
  const nextAction = applicationsNextAction({
    approvedCount: approvedApplications.length,
    approvedLaunchableCount,
    readyCount: readyLaunchableCount,
    agencyCandidateCount: agencyCandidates.length,
  });

  const fallbacks = getServiceFallbacks(["openai", "email_sync"], {
    anyEmailSyncConnected: Boolean(emailConnection),
  });

  return (
    <>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application control"
          title="Apply Sprint"
          description="Work the applications the agency has approved and prepared. The assistant helps fill forms, but final submission stays under your control."
        />
        <ServiceFallbackBanners items={fallbacks} />
        <LifecycleReadinessContext stages={["apply", "follow_up", "interview", "outcome"]} title="Application lifecycle readiness" />
        {approvedApplications.length ? (
          <ApprovedToReadyPanel
            approvedCount={approvedApplications.length}
            launchableCount={approvedLaunchableCount}
            missingUrlCount={approvedMissingUrlCount}
            missingMaterialsCount={approvedMissingMaterialsCount}
            materialBlockedCount={approvedMaterialBlockedCount}
          />
        ) : null}
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
                  <AgencyRunControl
                    label={nextAction.label}
                    color="primary"
                    minimumScore={nextAction.body.minimumScore}
                    limit={nextAction.body.limit}
                    showLatestOnMount={false}
                  />
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
                        Prepare eligible saved matches directly for Apply Sprint.
                      </Typography>
                    </Box>
                    <AgencyRunControl minimumScore={0} buttonSx={{ minHeight: 44, px: 2.25 }} />
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
                          Prepare approved applications for Apply
                        </Typography>
                        <BulkMoveToSprintControl buttonSx={commandButtonSx} />
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
            const items = visibleApplications.filter((application) => applicationBoardColumn(application) === status);
            const isReadyColumn = status === "ready_to_apply";
            const isMaterialBlockedColumn = status === "material_blocked";
            return (
              <Card key={status} sx={{ minHeight: 220, borderColor: isReadyColumn && items.length ? "success.main" : isMaterialBlockedColumn && items.length ? "warning.main" : "divider" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box>
                      <StatusChip status={status} />
                      {status === "approved" ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                          These are approved and still eligible for packet prep.
                        </Typography>
                      ) : null}
                      {isMaterialBlockedColumn ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                          These passed job review, but their generated materials failed QA or generation.
                        </Typography>
                      ) : null}
                      {isReadyColumn ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                          These applications are already in Apply Sprint.
                        </Typography>
                      ) : null}
                    </Box>
                    <Chip label={items.length} color={isReadyColumn && items.length ? "success" : "default"} sx={{ fontVariantNumeric: "tabular-nums" }} />
                  </Stack>
                  {isReadyColumn && items.length ? (
                    <Button
                      component={Link}
                      href="/applications/assistant"
                      fullWidth
                      variant="contained"
                      color="success"
                      startIcon={<BoltOutlinedIcon />}
                      sx={{ mt: 1.5, justifyContent: "flex-start" }}
                    >
                      Open {items.length} in Apply Sprint
                    </Button>
                  ) : null}
                  {status === "approved" && items.length ? (
                    <Box sx={{ mt: 1.5 }}>
                      <BulkMoveToSprintControl
                        buttonSx={{ width: "100%", justifyContent: "flex-start" }}
                        label="Prepare approved for Ready to apply"
                        loadingLabel="Preparing..."
                      />
                    </Box>
                  ) : null}
                  {isMaterialBlockedColumn && items.length ? (
                    <Box sx={{ mt: 1.5 }}>
                      <BulkMoveToSprintControl
                        buttonSx={{ width: "100%", justifyContent: "flex-start" }}
                        buttonColor="warning"
                        queue="material_blocked"
                        label="Regenerate blocked materials"
                        loadingLabel="Regenerating..."
                        startNotice="Regenerating blocked resumes and cover letters. Passing applications will move to Ready to apply."
                      />
                    </Box>
                  ) : null}
                  <Stack spacing={1.5} sx={{ mt: 2 }}>
                    {items.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        {isReadyColumn
                          ? "No applications are currently in Apply Sprint."
                          : isMaterialBlockedColumn
                            ? "No applications are waiting on material review."
                          : `No ${formatStatus(status)} applications.`}
                      </Typography>
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
                          {application.status === "approved" ? (
                            <ApplicationPrepChecklist
                              hasResume={Boolean(application.resume)}
                              hasCoverLetter={Boolean(application.coverLetter)}
                              hasPacket={Boolean(application.applicationPackets.length)}
                              readiness={classifyVisibleApplicationReadiness(application)}
                            />
                          ) : null}
                          <Box sx={{ mt: 1 }}>
                            <ActionButton href={`/applications/${application.id}`} size="small" variant="outlined" startIcon={<FactCheckOutlinedIcon />}>
                              {isMaterialBlockedColumn ? "Review material issue" : "Review packet"}
                            </ActionButton>
                          </Box>
                          {application.status === "ready_to_apply" && application.resume && application.coverLetter && assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable ? (
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
                          {application.status === "ready_to_apply" && application.resume && application.coverLetter && assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable ? (
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
            <EmptyState title="No applications tracked" body="Run search from the Dashboard. Eligible saved matches will be prepared for Apply Sprint automatically." />
          </Card>
        ) : null}
      </Stack>
    </>
  );
}

function applicationsNextAction({
  approvedCount,
  approvedLaunchableCount,
  readyCount,
  agencyCandidateCount,
}: {
  approvedCount: number;
  approvedLaunchableCount: number;
  readyCount: number;
  agencyCandidateCount: number;
}) {
  if (readyCount > 0) {
    return {
      title: "Work Ready to apply",
      detail: "Ready to apply applications have a direct URL plus launchable resume and cover letter materials. Open the sprint console to launch the assistant and track submission.",
      label: "Open sprint console",
      href: "/applications/assistant",
      color: "success" as const,
      icon: <BoltOutlinedIcon />,
      count: readyCount,
    };
  }
  if (approvedCount > 0) {
    if (approvedLaunchableCount === 0) {
      return {
        title: "Fix approved application URLs",
        detail: "Approved applications need a direct employer or ATS form URL before they can move into Ready to apply.",
        label: "Review approved",
        href: "#approved",
        color: "primary" as const,
        icon: <ReportProblemOutlinedIcon />,
        count: approvedCount,
      };
    }
    return {
      title: "Prepare approved applications",
      detail: "Generate or validate packets, regenerate blocked letters if needed, then move launchable applications into Ready to apply.",
      label: "Prepare approved for Ready to apply",
      postTo: "/api/applications/bulk-move-to-sprint",
      body: { limit: Math.min(Math.max(approvedLaunchableCount, 1), 250), regenerateBlockedMaterials: true },
      runInBackground: true,
      loadingLabel: "Preparing...",
      color: "primary" as const,
      icon: <BoltOutlinedIcon />,
      count: approvedCount,
    };
  }
  if (agencyCandidateCount > 0) {
    return {
      title: "Run the recruiting agency",
      detail: "Eligible saved matches are waiting. Prepare them directly for Apply Sprint.",
      label: "Run agency",
      postTo: "/api/applications/agency/run",
      body: { minimumScore: 0, limit: Math.min(Math.max(agencyCandidateCount, 1), 100), triggeredBy: "manual" },
      runInBackground: true,
      loadingLabel: "Agency running...",
      color: "primary" as const,
      icon: <AutoAwesomeOutlinedIcon />,
      count: agencyCandidateCount,
    };
  }
  return {
    title: "Run search",
    detail: "Search results with usable application links will be prepared for Apply Sprint automatically.",
    label: "Open dashboard",
    href: "/dashboard",
    color: "primary" as const,
    icon: <FactCheckOutlinedIcon />,
  };
}

function ApprovedToReadyPanel({
  approvedCount,
  launchableCount,
  missingUrlCount,
  missingMaterialsCount,
  materialBlockedCount,
}: {
  approvedCount: number;
  launchableCount: number;
  missingUrlCount: number;
  missingMaterialsCount: number;
  materialBlockedCount: number;
}) {
  return (
    <Card id="approved" sx={{ borderColor: "primary.main" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="primary" label={`${approvedCount} approved`} />
                <Chip size="small" color={launchableCount ? "success" : "warning"} variant="outlined" label={`${launchableCount} with direct URL`} />
                {missingMaterialsCount ? <Chip size="small" color="warning" variant="outlined" label={`${missingMaterialsCount} need materials`} /> : null}
                {materialBlockedCount ? <Chip size="small" color="warning" variant="outlined" label={`${materialBlockedCount} material-blocked`} /> : null}
                {missingUrlCount ? <Chip size="small" color="warning" variant="outlined" label={`${missingUrlCount} need URL`} /> : null}
              </Stack>
              <Typography variant="h3">Approved to Ready</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
                Approved means the job passed review. Ready to apply means it has a direct application URL plus launchable resume and cover-letter materials. This also archives approved items without direct URLs.
              </Typography>
            </Box>
            {launchableCount ? (
              <BulkMoveToSprintControl
                label="Prepare approved for Ready to apply"
                loadingLabel="Preparing..."
                buttonSx={{ minHeight: 44, px: 2.25 }}
              />
            ) : (
              <ActionButton href="#approved" variant="contained" color="warning" startIcon={<ReportProblemOutlinedIcon />}>
                Add direct URLs first
              </ActionButton>
            )}
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
            <ReadinessStep complete={launchableCount > 0} title="1. Direct employer URL" detail="Board, auth, paywall, or listing URLs cannot launch the assistant." />
            <ReadinessStep complete={missingMaterialsCount === 0} title="2. Resume and cover letter" detail="The prep action generates missing materials and regenerates blocked cover letters." />
            <ReadinessStep complete={false} title="3. Ready to apply" detail="Passing applications move to Ready to apply. No-URL items archive; material-blocked items stay approved with their reason." />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ApplicationPrepChecklist({
  hasResume,
  hasCoverLetter,
  hasPacket,
  readiness,
}: {
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasPacket: boolean;
  readiness: ApplicationPrepReadiness;
}) {
  const launchableUrl = readiness.kind !== "no_direct_url";
  const blockers = [
    launchableUrl ? null : "Archives on prep: no direct employer/ATS URL",
    hasResume ? null : "Needs resume",
    hasCoverLetter ? null : "Needs cover letter",
    readiness.kind === "material_blocked" ? readiness.reason : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Box sx={{ mt: 1, border: 1, borderColor: blockers.length ? "warning.main" : "success.main", borderRadius: 1, p: 1 }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          <PrepChip complete={launchableUrl} label="Direct URL" />
          <PrepChip complete={hasResume} label="Resume" />
          <PrepChip complete={hasCoverLetter} label="Cover letter" />
          <PrepChip complete={hasPacket} label="Packet" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {blockers.length
            ? blockers.join(". ")
            : "Ready for packet validation. Prepare approved will move this when material quality passes."}
        </Typography>
      </Stack>
    </Box>
  );
}

function classifyVisibleApplicationReadiness(application: {
  resume: { id: string } | null;
  coverLetter: { id: string; generationNotes: unknown } | null;
  jobPosting: { applicationUrl: string | null };
}) {
  return classifyApplicationPrepReadiness({
    resumeId: application.resume?.id ?? null,
    coverLetterId: application.coverLetter?.id ?? null,
    coverLetter: application.coverLetter,
    jobPosting: application.jobPosting,
  });
}

function applicationBoardColumn(application: {
  status: string;
  resume: { id: string } | null;
  coverLetter: { id: string; generationNotes: unknown } | null;
  jobPosting: { applicationUrl: string | null };
}) {
  if (application.status === "approved" && classifyVisibleApplicationReadiness(application).kind === "material_blocked") {
    return "material_blocked";
  }
  return application.status;
}

function PrepChip({ complete, label }: { complete: boolean; label: string }) {
  return (
    <Chip
      size="small"
      color={complete ? "success" : "warning"}
      variant={complete ? "filled" : "outlined"}
      icon={complete ? <CheckCircleOutlineOutlinedIcon /> : <ReportProblemOutlinedIcon />}
      label={label}
    />
  );
}

function ReadinessStep({ complete, title, detail }: { complete: boolean; title: string; detail: string }) {
  return (
    <Box sx={{ border: 1, borderColor: complete ? "success.main" : "divider", borderRadius: 1, p: 1.5 }}>
      <Stack spacing={0.75}>
        {complete ? <CheckCircleOutlineOutlinedIcon color="success" fontSize="small" /> : <ReportProblemOutlinedIcon color="warning" fontSize="small" />}
        <Typography sx={{ fontWeight: 850 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </Stack>
    </Box>
  );
}
