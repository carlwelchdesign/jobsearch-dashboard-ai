export const metadata = {
  title: "Job Admin | Job Search OS",
  description: "Admin tooling for exceptions, rejected jobs, archived jobs, duplicate cleanup, and manual investigation.",
};

import AddIcon from "@mui/icons-material/Add";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import type { Prisma } from "@prisma/client";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { DetectJobQualityControl } from "@/components/detect-job-quality-control";
import { EvaluateJobsControl } from "@/components/evaluate-jobs-control";
import { LifecycleReadinessContext } from "@/components/readiness/lifecycle-context";
import { PageHeader } from "@/components/ui/page-header";
import { RunSearchControl } from "@/components/run-search-control";
import { submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { createApplicationCanonicalJobKeys } from "@/lib/applications/reconciliation";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { JobsTable } from "./jobs-table";

export const dynamic = "force-dynamic";

type StatusView = "active" | "rejected" | "archived" | "all";

export default async function JobsPage({ searchParams }: { searchParams?: { statusView?: string; q?: string; company?: string } }) {
  const statusView = normalizeStatusView(searchParams?.statusView);
  const searchQuery = normalizeSearchQuery(searchParams?.q ?? searchParams?.company);
  const [matches, submittedApplications] = await Promise.all([
    prisma.jobProfileMatch.findMany({
      where: statusWhere(statusView, searchQuery),
      include: {
        jobPosting: {
          include: { source: true },
        },
        jobSearchProfile: {
          select: { name: true, userId: true },
        },
      },
      orderBy: [{ status: "asc" }, { overallScore: "desc" }, { createdAt: "desc" }],
      take: 250,
    }),
    prisma.application.findMany({
      where: { status: { in: submittedApplicationStatuses } },
      select: {
        id: true,
        status: true,
        appliedAt: true,
        updatedAt: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: [{ appliedAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);
  const submittedApplicationByJobKey = new Map<string, typeof submittedApplications[number]>();
  for (const application of submittedApplications) {
    for (const key of createApplicationCanonicalJobKeys(application.jobPosting)) {
      if (!submittedApplicationByJobKey.has(key)) submittedApplicationByJobKey.set(key, application);
    }
  }
  const suppressionStates = await loadJobSuppressionStatesByUserIds(matches.map((match) => match.jobSearchProfile.userId));
  const reviewableMatches = statusView === "active"
    ? matches.filter((match) => {
      const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
      return !suppressionState || !isJobSuppressed(match.jobPosting, suppressionState);
    })
    : matches;
  const visibleMatches = uniqueMatchesByCanonicalJob(reviewableMatches).slice(0, 100);
  const evaluations = visibleMatches.length
    ? await prisma.jobEvaluation.findMany({
        where: {
          OR: visibleMatches.map((match) => ({
            jobPostingId: match.jobPostingId,
            jobSearchProfileId: match.jobSearchProfileId,
          })),
        },
      })
    : [];
  const evaluationByMatch = new Map(evaluations.map((evaluation) => [`${evaluation.jobPostingId}:${evaluation.jobSearchProfileId}`, evaluation]));
  const topReviewMatch = visibleMatches.find((match) => match.status === "needs_review") ?? null;
  const approvedForPrep = visibleMatches.filter((match) => ["approved", "resume_generated", "cover_letter_generated"].includes(match.status));

  const fallbacks = getServiceFallbacks(["openai", "brave"]);

  return (
    <>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Admin and exceptions"
          title="Job Admin"
          description="Investigate exceptions, rejected or archived roles, duplicate cleanup, and manual jobs. Normal search results are prepared for Apply Sprint automatically."
          actions={
            <>
              <ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddIcon />}>Add manual job</ActionButton>
              <DetectJobQualityControl />
              <EvaluateJobsControl />
              <RunSearchControl compact />
            </>
          }
        />
        <ServiceFallbackBanners items={fallbacks} />
        <LifecycleReadinessContext stages={["review", "search", "trust"]} title="Job review readiness" />

        <Card sx={{ borderColor: topReviewMatch ? "primary.main" : approvedForPrep.length ? "success.main" : "divider", bgcolor: topReviewMatch ? "rgba(37, 99, 235, 0.08)" : approvedForPrep.length ? "rgba(16, 185, 129, 0.08)" : "background.paper" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={topReviewMatch ? "primary" : approvedForPrep.length ? "success" : "default"} label="Next action" />
                  {topReviewMatch ? <Chip size="small" variant="outlined" label={`${topReviewMatch.overallScore} score`} /> : null}
                  {approvedForPrep.length ? <Chip size="small" variant="outlined" label={`${approvedForPrep.length} approved`} /> : null}
                </Stack>
                <Typography variant="h3">
                  {topReviewMatch ? "Review the top exception" : approvedForPrep.length ? "Recover approved jobs" : "Run discovery"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {topReviewMatch
                    ? `${topReviewMatch.jobPosting.company} - ${topReviewMatch.jobPosting.title} needs your decision before the agency can move it forward.`
                    : approvedForPrep.length
                      ? "Approved jobs are waiting outside the normal Apply Sprint flow and can be recovered here."
                      : "No admin exceptions are waiting. Run discovery or add a manual job."}
                </Typography>
              </Box>
              {topReviewMatch ? (
                <ActionButton href={`/jobs/${topReviewMatch.jobPostingId}`} variant="contained">
                  Open top match
                </ActionButton>
              ) : approvedForPrep.length ? (
                <BulkPrepareControl compact defaultMinimumScore={75} defaultLimit={10} />
              ) : (
                <RunSearchControl compact />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack
              component="form"
              method="GET"
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              sx={{ alignItems: { md: "center" } }}
            >
              {statusView === "active" ? null : <input type="hidden" name="statusView" value={statusView} />}
              <TextField
                fullWidth
                size="small"
                name="q"
                label="Search jobs"
                placeholder="Company, title, location, profile, source, or signal"
                defaultValue={searchQuery}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlinedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button type="submit" variant="contained" sx={{ minWidth: 120 }}>
                Search
              </Button>
              {searchQuery ? (
                <ActionButton href={statusView === "active" ? "/jobs" : `/jobs?statusView=${statusView}`} variant="outlined">
                  Clear
                </ActionButton>
              ) : null}
            </Stack>
            {searchQuery ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Showing jobs matching {searchQuery}.
              </Typography>
            ) : null}
          </CardContent>
        </Card>

        <JobsTable
          searchQuery={searchQuery}
          statusView={statusView}
          matches={visibleMatches.map((match) => {
            const evaluation = evaluationByMatch.get(`${match.jobPostingId}:${match.jobSearchProfileId}`);
            return {
              action: evaluation?.recommendedAction ?? null,
              confidenceScore: evaluation?.confidenceScore ?? null,
              id: match.id,
              jobId: match.jobPosting.id,
              opportunityScore: evaluation?.opportunityScore ?? null,
              duplicateGroupId: match.jobPosting.duplicateGroupId,
              score: match.overallScore,
              staleScore: match.jobPosting.staleScore,
              title: match.jobPosting.title,
              company: match.jobPosting.company,
              location: match.jobPosting.location ?? "Unknown location",
              status: match.status,
              profileName: match.jobSearchProfile.name,
              sourceName: match.jobPosting.source?.name ?? "Manual",
              strongestMatches: jsonArray(match.strongestMatches),
              applicationState: (() => {
                const application = createApplicationCanonicalJobKeys(match.jobPosting)
                .map((key) => submittedApplicationByJobKey.get(key))
                  .find(Boolean);
                return application
                  ? {
                      id: application.id,
                      status: application.status,
                      appliedAt: application.appliedAt?.toISOString() ?? null,
                    }
                  : null;
              })(),
            };
          })}
        />
      </Stack>
    </>
  );
}

function normalizeStatusView(value: string | undefined): StatusView {
  return value === "rejected" || value === "archived" || value === "all" ? value : "active";
}

function normalizeSearchQuery(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function statusWhere(statusView: StatusView, searchQuery = ""): Prisma.JobProfileMatchWhereInput {
  const jobPostingWhere: Prisma.JobPostingWhereInput = {
    ...(searchQuery
      ? {
          OR: [
            { company: { contains: searchQuery, mode: "insensitive" } },
            { title: { contains: searchQuery, mode: "insensitive" } },
            { location: { contains: searchQuery, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (statusView === "rejected") return { status: { in: ["rejected"] }, jobPosting: jobPostingWhere };
  if (statusView === "archived") return { status: { in: ["archived"] }, jobPosting: jobPostingWhere };
  if (statusView === "all") return { jobPosting: jobPostingWhere };
  return {
    status: { notIn: ["rejected", "archived"] },
    jobPosting: {
      ...jobPostingWhere,
      applications: {
        none: {
          status: { in: submittedApplicationStatuses },
        },
      },
    },
  };
}
