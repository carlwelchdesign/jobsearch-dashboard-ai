import type { AgentQualityEvaluationStatus, AgentQualityTarget, AgentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AgentQualityGateStatus = "pass" | "stale" | "missing_eval" | "needs_review" | "blocked";

export type AgentQualityGate = {
  target: AgentQualityTarget;
  label: string;
  ownerArea: string;
  status: AgentQualityGateStatus;
  canScale: boolean;
  score: number | null;
  latestEvaluationId: string | null;
  latestEvaluationStatus: AgentQualityEvaluationStatus | null;
  latestEvaluationAt: string | null;
  latestSummary: string | null;
  examples: number;
  evaluations: number;
  failedEvaluations: number;
  needsReviewEvaluations: number;
  proposedImprovements: number;
  blockedActions: number;
  coveredAgentTypes: AgentType[];
  detail: string;
  nextActionLabel: string;
  nextActionHref: string;
};

export type AgentQualityGateSummary = {
  generatedAt: string;
  userId: string;
  total: number;
  pass: number;
  stale: number;
  missingEval: number;
  needsReview: number;
  blocked: number;
  canScale: number;
  gates: AgentQualityGate[];
};

type GateDefinition = {
  target: AgentQualityTarget;
  label: string;
  ownerArea: string;
  coveredAgentTypes: AgentType[];
  nextActionHref: string;
};

const STALE_EVALUATION_DAYS = 14;
const PASS_SCORE = 85;
const BLOCK_SCORE = 70;

const gateDefinitions: GateDefinition[] = [
  {
    target: "APPLICATION_ASSISTANT",
    label: "Application Assistant",
    ownerArea: "Apply Sprint",
    coveredAgentTypes: ["RECRUITING_AGENCY"],
    nextActionHref: "/applications/assistant",
  },
  {
    target: "RECRUITING_AGENCY",
    label: "Recruiting Agency",
    ownerArea: "Apply Sprint",
    coveredAgentTypes: ["RECRUITING_AGENCY"],
    nextActionHref: "/applications/assistant",
  },
  {
    target: "JOB_SEARCH",
    label: "Job Search",
    ownerArea: "Search",
    coveredAgentTypes: ["SEARCH_EXPANSION", "DUPLICATE_STALE_JOB_DETECTOR", "SEARCH_PROFILE_MANAGER", "RECRUITING_SEARCH_DIRECTOR", "SEARCH_YIELD_ANALYST", "SEARCH_PROFILE_EDITOR", "SOURCE_QUALITY_ANALYST", "MATCH_CALIBRATION_REVIEWER", "OUTCOME_RECRUITER"],
    nextActionHref: "/dashboard/search",
  },
  {
    target: "JOB_MATCHING",
    label: "Job Matching",
    ownerArea: "Job review",
    coveredAgentTypes: ["JOB_FIT_SCORER"],
    nextActionHref: "/jobs",
  },
  {
    target: "GENERATED_MATERIALS",
    label: "Generated Materials",
    ownerArea: "Materials trust",
    coveredAgentTypes: ["RESUME_STRATEGY", "COVER_LETTER_WRITER", "APPLICATION_EVIDENCE_CURATOR", "HIRING_MANAGER_REVIEWER", "APPLICATION_QA", "ANTI_GENERIC_WRITING"],
    nextActionHref: "/resumes/generated",
  },
  {
    target: "GITHUB_REVIEW",
    label: "GitHub Review",
    ownerArea: "Portfolio evidence",
    coveredAgentTypes: ["GITHUB_PORTFOLIO_REVIEW", "PORTFOLIO_MATCH"],
    nextActionHref: "/resumes/profile",
  },
  {
    target: "OUTREACH",
    label: "Outreach",
    ownerArea: "Outreach and email",
    coveredAgentTypes: ["RECRUITER_INTELLIGENCE", "NETWORKING_STRATEGY", "JOLENE_EMAIL_OPERATIONS", "EMAIL_INBOX_SCOUT", "EMAIL_APPLICATION_MATCHER", "EMAIL_OUTCOME_CLASSIFIER", "EMAIL_SCHEDULING_COORDINATOR", "EMAIL_ACTION_DRAFTER", "EMAIL_PRIVACY_REVIEWER", "EMAIL_OPS_REPORTER", "LINKEDIN_CONTENT"],
    nextActionHref: "/dashboard/email-ops",
  },
  {
    target: "OUTCOME_LEARNING",
    label: "Outcome Learning",
    ownerArea: "Learning loop",
    coveredAgentTypes: ["OUTCOME_LEARNING"],
    nextActionHref: "/outcomes",
  },
  {
    target: "COMMAND_CENTER",
    label: "Command Center",
    ownerArea: "Operations",
    coveredAgentTypes: ["DAILY_COMMAND_CENTER", "JOLENE_CHIEF_OF_STAFF", "JOLENE_OPERATING_LOOP", "MARKET_INTELLIGENCE", "SYSTEM_ARCHITECTURE"],
    nextActionHref: "/dashboard",
  },
];

export async function buildAgentQualityGates({ userId }: { userId: string }): Promise<AgentQualityGateSummary> {
  const generatedAt = new Date();
  const staleCutoff = new Date(generatedAt.getTime() - STALE_EVALUATION_DAYS * 24 * 60 * 60 * 1000);
  const targets = gateDefinitions.map((definition) => definition.target);
  const [examples, evaluations, proposals, runs] = await Promise.all([
    prisma.agentQualityExample.groupBy({
      by: ["target"],
      where: { userId, target: { in: targets } },
      _count: { _all: true },
    }),
    prisma.agentQualityEvaluation.findMany({
      where: { userId, target: { in: targets } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.agentImprovementProposal.groupBy({
      by: ["target", "status"],
      where: { userId, target: { in: targets } },
      _count: { _all: true },
    }),
    prisma.agentRun.findMany({
      where: { userId, agentType: { in: unique(gateDefinitions.flatMap((definition) => definition.coveredAgentTypes)) } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        events: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
  ]);

  const examplesByTarget = new Map<AgentQualityTarget, number>();
  for (const item of examples) examplesByTarget.set(item.target, item._count._all);

  const evaluationsByTarget = new Map<AgentQualityTarget, typeof evaluations>();
  for (const evaluation of evaluations) {
    evaluationsByTarget.set(evaluation.target, [...(evaluationsByTarget.get(evaluation.target) ?? []), evaluation]);
  }

  const proposedByTarget = new Map<AgentQualityTarget, number>();
  for (const proposal of proposals) {
    if (proposal.status === "PROPOSED") proposedByTarget.set(proposal.target, (proposedByTarget.get(proposal.target) ?? 0) + proposal._count._all);
  }

  const blockedActionsByTarget = new Map<AgentQualityTarget, number>();
  for (const definition of gateDefinitions) {
    const covered = new Set(definition.coveredAgentTypes);
    const count = runs
      .filter((run) => covered.has(run.agentType))
      .reduce((sum, run) => sum + run.events.filter(isBlockedActionEvent).length, 0);
    blockedActionsByTarget.set(definition.target, count);
  }

  const gates = gateDefinitions.map((definition) => {
    const targetEvaluations = evaluationsByTarget.get(definition.target) ?? [];
    const latest = targetEvaluations[0] ?? null;
    const examplesCount = examplesByTarget.get(definition.target) ?? 0;
    const failedEvaluations = targetEvaluations.filter((evaluation) => evaluation.status === "FAILED").length;
    const needsReviewEvaluations = targetEvaluations.filter((evaluation) => evaluation.status === "NEEDS_REVIEW").length;
    const proposedImprovements = proposedByTarget.get(definition.target) ?? 0;
    const blockedActions = blockedActionsByTarget.get(definition.target) ?? 0;
    const status = gateStatus({
      examples: examplesCount,
      latestStatus: latest?.status ?? null,
      latestScore: latest?.score ?? null,
      latestEvaluatedAt: latest?.createdAt ?? null,
      failedEvaluations,
      needsReviewEvaluations,
      proposedImprovements,
      blockedActions,
      staleCutoff,
    });
    return {
      target: definition.target,
      label: definition.label,
      ownerArea: definition.ownerArea,
      status,
      canScale: status === "pass",
      score: latest?.score ?? null,
      latestEvaluationId: latest?.id ?? null,
      latestEvaluationStatus: latest?.status ?? null,
      latestEvaluationAt: latest?.createdAt.toISOString() ?? null,
      latestSummary: latest?.summary ?? null,
      examples: examplesCount,
      evaluations: targetEvaluations.length,
      failedEvaluations,
      needsReviewEvaluations,
      proposedImprovements,
      blockedActions,
      coveredAgentTypes: definition.coveredAgentTypes,
      detail: detailForGate(status, definition.label, {
        examples: examplesCount,
        score: latest?.score ?? null,
        failedEvaluations,
        needsReviewEvaluations,
        proposedImprovements,
        blockedActions,
      }),
      nextActionLabel: nextActionLabel(status),
      nextActionHref: definition.nextActionHref,
    } satisfies AgentQualityGate;
  });

  return {
    generatedAt: generatedAt.toISOString(),
    userId,
    total: gates.length,
    pass: gates.filter((gate) => gate.status === "pass").length,
    stale: gates.filter((gate) => gate.status === "stale").length,
    missingEval: gates.filter((gate) => gate.status === "missing_eval").length,
    needsReview: gates.filter((gate) => gate.status === "needs_review").length,
    blocked: gates.filter((gate) => gate.status === "blocked").length,
    canScale: gates.filter((gate) => gate.canScale).length,
    gates,
  };
}

function gateStatus({
  examples,
  latestStatus,
  latestScore,
  latestEvaluatedAt,
  failedEvaluations,
  needsReviewEvaluations,
  proposedImprovements,
  blockedActions,
  staleCutoff,
}: {
  examples: number;
  latestStatus: AgentQualityEvaluationStatus | null;
  latestScore: number | null;
  latestEvaluatedAt: Date | null;
  failedEvaluations: number;
  needsReviewEvaluations: number;
  proposedImprovements: number;
  blockedActions: number;
  staleCutoff: Date;
}): AgentQualityGateStatus {
  if (!examples || !latestStatus) return "missing_eval";
  if (latestStatus === "FAILED" || failedEvaluations > 0 || blockedActions > 0 || (typeof latestScore === "number" && latestScore < BLOCK_SCORE)) return "blocked";
  if (latestStatus === "NEEDS_REVIEW" || needsReviewEvaluations > 0 || proposedImprovements > 0 || (typeof latestScore === "number" && latestScore < PASS_SCORE)) return "needs_review";
  if (latestEvaluatedAt && latestEvaluatedAt < staleCutoff) return "stale";
  return "pass";
}

function detailForGate(status: AgentQualityGateStatus, label: string, counts: {
  examples: number;
  score: number | null;
  failedEvaluations: number;
  needsReviewEvaluations: number;
  proposedImprovements: number;
  blockedActions: number;
}) {
  if (status === "missing_eval") return `${label} needs quality examples and a current evaluation before scaling.`;
  if (status === "blocked") {
    if (counts.blockedActions) return `${label} has ${counts.blockedActions} blocked action event(s) and must stay review-first.`;
    if (counts.failedEvaluations) return `${label} has ${counts.failedEvaluations} failed evaluation(s).`;
    return `${label} score is ${counts.score ?? "unknown"}, below the scale threshold.`;
  }
  if (status === "needs_review") {
    if (counts.proposedImprovements) return `${label} has ${counts.proposedImprovements} proposed improvement(s) awaiting review.`;
    if (counts.needsReviewEvaluations) return `${label} has ${counts.needsReviewEvaluations} needs-review evaluation(s).`;
    return `${label} score is ${counts.score ?? "unknown"} and needs improvement before scaling.`;
  }
  if (status === "stale") return `${label} last passed but needs a fresh evaluation before wider reliance.`;
  return `${label} is passing with ${counts.examples} quality example(s) and score ${counts.score}.`;
}

function nextActionLabel(status: AgentQualityGateStatus) {
  if (status === "missing_eval") return "Backfill examples";
  if (status === "blocked") return "Review failures";
  if (status === "needs_review") return "Review proposals";
  if (status === "stale") return "Run evaluation";
  return "Inspect";
}

function isBlockedActionEvent(event: { type: string; message: string }) {
  return /\b(blocked|denied|rejected|external_blocked|approval_required|unauthorized)\b/i.test(`${event.type} ${event.message}`);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
