import AddIcon from "@mui/icons-material/Add";
import type { Prisma } from "@prisma/client";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { DetectJobQualityControl } from "@/components/detect-job-quality-control";
import { EvaluateJobsControl } from "@/components/evaluate-jobs-control";
import { PageHeader } from "@/components/ui/page-header";
import { RunSearchControl } from "@/components/run-search-control";
import { submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { JobsTable } from "./jobs-table";

export const dynamic = "force-dynamic";

type StatusView = "active" | "rejected" | "archived" | "all";

export default async function JobsPage({ searchParams }: { searchParams?: { statusView?: string } }) {
  const statusView = normalizeStatusView(searchParams?.statusView);
  const matches = await prisma.jobProfileMatch.findMany({
    where: statusWhere(statusView),
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
  });
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

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Decision queue"
          title="Jobs"
          description="Review scored roles from job boards, company sources, and browser capture. Approving a job creates the application tracker and moves it toward packet generation."
          actions={
            <>
              <ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddIcon />}>Add manual job</ActionButton>
              <DetectJobQualityControl />
              <EvaluateJobsControl />
              <RunSearchControl compact />
            </>
          }
        />

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
                  {topReviewMatch ? "Review the top match" : approvedForPrep.length ? "Prepare approved jobs" : "Run discovery"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {topReviewMatch
                    ? `${topReviewMatch.jobPosting.company} - ${topReviewMatch.jobPosting.title} is the highest-scoring item waiting for a decision.`
                    : approvedForPrep.length
                      ? "Approved jobs are ready for tailored resumes, cover letters, and application packets."
                      : "No reviewable jobs are waiting. Run discovery or add a manual job."}
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

        <BulkPrepareControl defaultMinimumScore={75} defaultLimit={10} />

        <JobsTable
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
            };
          })}
        />
      </Stack>
    </AppShell>
  );
}

function normalizeStatusView(value: string | undefined): StatusView {
  return value === "rejected" || value === "archived" || value === "all" ? value : "active";
}

function statusWhere(statusView: StatusView): Prisma.JobProfileMatchWhereInput {
  if (statusView === "rejected") return { status: { in: ["rejected"] } };
  if (statusView === "archived") return { status: { in: ["archived"] } };
  if (statusView === "all") return {};
  return {
    status: { notIn: ["rejected", "archived"] },
    jobPosting: {
      applications: {
        none: {
          status: { in: submittedApplicationStatuses },
        },
      },
    },
  };
}
