import AddIcon from "@mui/icons-material/Add";
import type { Prisma } from "@prisma/client";
import Stack from "@mui/material/Stack";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { BulkPrepareControl } from "@/components/bulk-prepare-control";
import { EvaluateJobsControl } from "@/components/evaluate-jobs-control";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { RunSearchControl } from "@/components/run-search-control";
import { jsonArray } from "@/lib/json";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
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
        select: { name: true },
      },
    },
    orderBy: [{ status: "asc" }, { overallScore: "desc" }, { createdAt: "desc" }],
    take: 250,
  });
  const visibleMatches = uniqueMatchesByCanonicalJob(matches).slice(0, 100);
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

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Review queue"
          title="Jobs"
          description="Step 2: review matches and make the decision. Approve jobs you want to tailor, reject the noise, or open a job for package generation."
          actions={
            <>
              <ActionButton href="/jobs/manual" variant="outlined" startIcon={<AddIcon />}>Add manual job</ActionButton>
              <EvaluateJobsControl />
              <RunSearchControl compact />
            </>
          }
        />

        <WorkflowGuide active="jobs" title="Step 2 of 5: approve the right jobs" />

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
              score: match.overallScore,
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
  return { status: { notIn: ["rejected", "archived"] } };
}
