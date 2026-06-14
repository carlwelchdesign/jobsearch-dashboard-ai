import type { JobEvaluation, JobPosting, JobProfileMatch, JobSearchProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";

export type DailyCommandCenterInput = {
  userId?: string;
  parentRunId?: string;
};

export type DailyCommandCenterOutput = {
  generatedAt: string;
  summary: string;
  actions: Array<{
    priority: number;
    category: "run_agency" | "review_jobs" | "prepare_packets" | "submit_applications" | "follow_up" | "fix_evidence" | "optimize_profiles" | "run_search";
    title: string;
    detail: string;
    href: string;
    count?: number;
  }>;
  blockers: string[];
  confidence: number;
  rationale: string;
};

type MatchWithJob = JobProfileMatch & {
  jobPosting: JobPosting;
  jobSearchProfile: Pick<JobSearchProfile, "name">;
};

type EvaluationWithJob = JobEvaluation & {
  jobPosting: JobPosting;
  jobSearchProfile: Pick<JobSearchProfile, "name">;
};

export async function runDailyCommandCenterAgent(input: DailyCommandCenterInput = {}) {
  return runAgent<DailyCommandCenterInput, DailyCommandCenterOutput>({
    agentType: "DAILY_COMMAND_CENTER",
    input,
    userId: input.userId,
    parentRunId: input.parentRunId,
    execute: async () => {
      const [needsReview, approved, readyApplications, followUps, evidenceNeedsReview, profileOptimizerRun, latestSearchRun, applyNowEvaluations, agencyCandidateCount] = await Promise.all([
        prisma.jobProfileMatch.findMany({
          where: { status: "needs_review" },
          include: { jobPosting: true, jobSearchProfile: { select: { name: true } } },
          orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.jobProfileMatch.findMany({
          where: { status: "approved" },
          include: { jobPosting: true, jobSearchProfile: { select: { name: true } } },
          orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.application.findMany({
          where: { status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } },
          include: { jobPosting: true, jobProfileMatch: true },
          orderBy: [{ jobProfileMatch: { overallScore: "desc" } }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.application.findMany({
          where: {
            OR: [
              { status: "follow_up_due" },
              { followUpAt: { lte: new Date() } },
            ],
          },
          include: { jobPosting: true },
          orderBy: [{ followUpAt: "asc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.candidateEvidence.count({ where: { confidence: "NEEDS_REVIEW" } }),
        prisma.agentRun.findFirst({ where: { agentType: "SEARCH_PROFILE_MANAGER", status: "COMPLETED" }, orderBy: { createdAt: "desc" } }),
        prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
        prisma.jobEvaluation.findMany({
          where: { recommendedAction: "APPLY_NOW" },
          include: { jobPosting: true, jobSearchProfile: { select: { name: true } } },
          orderBy: [{ opportunityScore: "desc" }, { fitScore: "desc" }],
          take: 10,
        }),
        prisma.jobProfileMatch.count({
          where: {
            status: "needs_review",
            overallScore: { gte: 90 },
            jobPosting: {
              applicationUrl: { not: null },
              applications: { none: {} },
            },
          },
        }),
      ]);

      return buildDailyCommandCenter({
        needsReview,
        approved,
        readyApplications,
        followUps,
        evidenceNeedsReview,
        profileOptimizerRunCreatedAt: profileOptimizerRun?.createdAt ?? null,
        latestSearchRunStartedAt: latestSearchRun?.startedAt ?? null,
        applyNowEvaluations,
        agencyCandidateCount,
      });
    },
  });
}

export function buildDailyCommandCenter({
  needsReview,
  approved,
  readyApplications,
  followUps,
  evidenceNeedsReview,
  profileOptimizerRunCreatedAt,
  latestSearchRunStartedAt,
  applyNowEvaluations,
  agencyCandidateCount,
}: {
  needsReview: MatchWithJob[];
  approved: MatchWithJob[];
  readyApplications: Array<{ id: string; jobPosting: JobPosting; jobProfileMatch: JobProfileMatch | null }>;
  followUps: Array<{ id: string; jobPosting: JobPosting; followUpAt: Date | null; updatedAt: Date }>;
  evidenceNeedsReview: number;
  profileOptimizerRunCreatedAt: Date | null;
  latestSearchRunStartedAt: Date | null;
  applyNowEvaluations: EvaluationWithJob[];
  agencyCandidateCount: number;
}): DailyCommandCenterOutput {
  const actions: DailyCommandCenterOutput["actions"] = [];
  const blockers: string[] = [];
  const strongNeedsReview = needsReview.filter((match) => match.overallScore >= 85).slice(0, 8);
  const topApplyNow = applyNowEvaluations.slice(0, 5);

  if (readyApplications.length > 0) {
    const top = readyApplications[0];
    actions.push({
      priority: 1,
      category: "submit_applications",
      title: `Submit ${Math.min(readyApplications.length, 5)} ready application${readyApplications.length === 1 ? "" : "s"}`,
      detail: `Start with ${top.jobPosting.company} - ${top.jobPosting.title}. Materials are ready and submission remains manual.`,
      href: "/applications/assistant",
      count: readyApplications.length,
    });
  }

  if (agencyCandidateCount > 0) {
    actions.push({
      priority: 2,
      category: "run_agency",
      title: `Run agency on ${Math.min(agencyCandidateCount, 10)} strong match${agencyCandidateCount === 1 ? "" : "es"}`,
      detail: "Auto-approve 90+ matches, create application trackers, and generate packets for Apply Sprint.",
      href: "/applications",
      count: agencyCandidateCount,
    });
  }

  if (strongNeedsReview.length > 0 || topApplyNow.length > 0) {
    const first = topApplyNow[0]?.jobPosting ?? strongNeedsReview[0]?.jobPosting;
    actions.push({
      priority: agencyCandidateCount > 0 ? 3 : 2,
      category: "review_jobs",
      title: `Review ${Math.max(strongNeedsReview.length, topApplyNow.length)} high-fit job${Math.max(strongNeedsReview.length, topApplyNow.length) === 1 ? "" : "s"}`,
      detail: first ? `Start with ${first.company} - ${first.title}.` : "Review high-fit jobs in the queue.",
      href: "/jobs",
      count: Math.max(strongNeedsReview.length, topApplyNow.length),
    });
  }

  if (approved.length > 0) {
    const top = approved[0];
    actions.push({
      priority: 3,
      category: "prepare_packets",
      title: `Prepare ${Math.min(approved.length, 5)} application package${approved.length === 1 ? "" : "s"}`,
      detail: `Start with ${top.jobPosting.company} - ${top.jobPosting.title}.`,
      href: "/applications",
      count: approved.length,
    });
  }

  if (followUps.length > 0) {
    const top = followUps[0];
    actions.push({
      priority: 4,
      category: "follow_up",
      title: `Handle ${followUps.length} follow-up${followUps.length === 1 ? "" : "s"}`,
      detail: `Oldest due item: ${top.jobPosting.company} - ${top.jobPosting.title}.`,
      href: "/applications",
      count: followUps.length,
    });
  }

  if (evidenceNeedsReview > 0) {
    actions.push({
      priority: 5,
      category: "fix_evidence",
      title: `Review ${Math.min(evidenceNeedsReview, 10)} evidence item${evidenceNeedsReview === 1 ? "" : "s"}`,
      detail: "Approve, edit, or reject uncertain evidence before it can influence final materials.",
      href: "/evidence?confidence=NEEDS_REVIEW",
      count: evidenceNeedsReview,
    });
  }

  if (isOlderThanDays(profileOptimizerRunCreatedAt, 7)) {
    actions.push({
      priority: 6,
      category: "optimize_profiles",
      title: "Refresh search profile optimizer",
      detail: "Profile recommendations are older than a week or have not been run yet.",
      href: "/profiles",
    });
  }

  if (isOlderThanDays(latestSearchRunStartedAt, 1) && needsReview.length < 10) {
    actions.push({
      priority: 7,
      category: "run_search",
      title: "Run job discovery",
      detail: "The latest search is stale or the review queue is light.",
      href: "/runs",
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: 1,
      category: "run_search",
      title: "Run a focused search or update outcomes",
      detail: "No urgent queue items are waiting. Refresh discovery or update application outcomes.",
      href: "/dashboard",
    });
  }

  if (evidenceNeedsReview > 20) blockers.push("Evidence review backlog is high. Generated materials may miss useful facts until evidence is approved.");
  if (readyApplications.length > 10) blockers.push("Ready queue is larger than a practical daily submit batch. Submit or archive older items.");

  const topActions = actions.sort((left, right) => left.priority - right.priority).slice(0, 6);
  return {
    generatedAt: new Date().toISOString(),
    summary: summarizePlan(topActions),
    actions: topActions,
    blockers,
    confidence: topActions.length >= 3 ? 0.82 : 0.68,
    rationale: "Prioritized manual-submit work by queue state, score, opportunity, stale search/profile signals, evidence quality, and follow-up urgency.",
  };
}

function summarizePlan(actions: DailyCommandCenterOutput["actions"]) {
  const first = actions[0];
  if (!first) return "No urgent job-search actions are waiting.";
  return `${first.title}. Then work the next ${Math.max(0, actions.length - 1)} supporting action${actions.length === 2 ? "" : "s"}.`;
}

function isOlderThanDays(date: Date | null, days: number) {
  if (!date) return true;
  return Date.now() - date.getTime() > days * 86_400_000;
}
