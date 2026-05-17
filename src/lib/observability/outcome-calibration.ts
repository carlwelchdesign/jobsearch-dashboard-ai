import type { AgentQualityTarget, Prisma } from "@prisma/client";
import { sanitizeTraceInput } from "@/lib/observability/langsmith";
import { ensureAgentQualityDataset, proposeImprovementsFromFailedExamples } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

const OUTCOME_SIGNAL_PREFIX = "outcome_calibration";
const ACTIVE_MATCH_STATUSES = ["discovered", "needs_review", "approved", "saved_for_later", "ready_to_apply", "resume_generated", "cover_letter_generated"] as const;
const APPLIED_STATUSES = ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"] as const;
const POSITIVE_STATUSES = ["screening", "interviewing", "offer"] as const;
const NEGATIVE_STATUSES = ["rejected", "rejected_by_company", "archived"] as const;

export type OutcomeCalibrationStatus = "healthy" | "watch" | "needs_review" | "insufficient_data";

export type OutcomeCalibrationSignal = {
  key: string;
  target: AgentQualityTarget;
  category: string;
  title: string;
  summary: string;
  severity: OutcomeCalibrationStatus;
  count: number;
  examplesCreated?: number;
};

export type OutcomeCalibrationReport = {
  summary: {
    applications: number;
    applied: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    callbackRate: number | null;
    rejectedHighScoreMatches: number;
    duplicateActiveGroups: number;
    resurfacedSuppressedJobs: number;
    assistantFailures: number;
    qualityExamples: number;
    proposedImprovements: number;
  };
  workflows: Array<{
    target: AgentQualityTarget;
    status: OutcomeCalibrationStatus;
    score: number | null;
    summary: string;
    metrics: Record<string, number | null>;
  }>;
  signals: OutcomeCalibrationSignal[];
};

type LoadedData = Awaited<ReturnType<typeof loadOutcomeData>>;

export async function getOutcomeCalibration(userId?: string | null): Promise<OutcomeCalibrationReport> {
  const data = await loadOutcomeData(userId);
  return buildOutcomeCalibrationReport(data);
}

export async function recomputeOutcomeCalibration(userId?: string | null) {
  const data = await loadOutcomeData(userId);
  const report = buildOutcomeCalibrationReport(data);
  const ownerId = userId ?? data.user?.id;
  if (!ownerId) return { ...report, createdExamples: 0, proposals: 0 };

  let createdExamples = 0;
  for (const signal of report.signals.filter((item) => item.severity === "needs_review" || item.severity === "watch")) {
    const created = await createOutcomeQualityExample(ownerId, signal, data);
    if (created) createdExamples += 1;
  }

  let proposals = 0;
  for (const target of Array.from(new Set(report.signals.map((signal) => signal.target)))) {
    const result = await proposeImprovementsFromFailedExamples(ownerId, target);
    proposals += result.created;
  }

  return { ...report, createdExamples, proposals };
}

function buildOutcomeCalibrationReport(data: LoadedData): OutcomeCalibrationReport {
  const applications = data.applications;
  const applied = applications.filter((application) => isAppliedApplication(application)).length;
  const positiveOutcomes = applications.filter((application) => isPositiveApplication(application)).length;
  const negativeOutcomes = applications.filter((application) => isNegativeApplication(application)).length;
  const rejectedHighScoreMatches = data.matches.filter((match) => match.status === "rejected" && match.overallScore >= 85).length;
  const duplicateActiveGroups = activeDuplicateGroups(data.matches);
  const resurfacedSuppressedJobs = data.suppressions.filter((suppression) => {
    if (!suppression.jobPostingId) return false;
    return data.matches.some((match) => match.jobPostingId === suppression.jobPostingId && ACTIVE_MATCH_STATUSES.includes(match.status as typeof ACTIVE_MATCH_STATUSES[number]));
  }).length;
  const assistantFailures = data.automationRuns.filter((run) => run.status === "FAILED" || run.status === "NEEDS_USER" || run.blockerType).length;
  const callbackRate = applied ? percent(positiveOutcomes, applied) : null;
  const proposedImprovements = data.proposals.filter((proposal) => proposal.status === "PROPOSED").length;

  const summary = {
    applications: applications.length,
    applied,
    positiveOutcomes,
    negativeOutcomes,
    callbackRate,
    rejectedHighScoreMatches,
    duplicateActiveGroups,
    resurfacedSuppressedJobs,
    assistantFailures,
    qualityExamples: data.qualityExamples.length,
    proposedImprovements,
  };

  const workflows = [
    workflow("JOB_SEARCH", scoreSearch(summary), searchSummary(summary), {
      duplicateActiveGroups,
      resurfacedSuppressedJobs,
    }),
    workflow("JOB_MATCHING", scoreMatching(summary), matchingSummary(summary), {
      rejectedHighScoreMatches,
      negativeOutcomes,
    }),
    workflow("RECRUITING_AGENCY", scoreAgency(summary), agencySummary(summary), {
      applied,
      positiveOutcomes,
      callbackRate,
    }),
    workflow("APPLICATION_ASSISTANT", scoreAssistant(summary), assistantSummary(summary), {
      assistantFailures,
      applications: applications.length,
    }),
  ];

  return {
    summary,
    workflows,
    signals: buildSignals(summary),
  };
}

async function loadOutcomeData(userId?: string | null) {
  const user = userId ? { id: userId } : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const whereUser = user?.id ? { userId: user.id } : {};
  const [
    applications,
    matches,
    suppressions,
    automationRuns,
    qualityExamples,
    proposals,
  ] = await Promise.all([
    prisma.application.findMany({
      where: whereUser,
      include: {
        outcomes: { orderBy: { occurredAt: "desc" }, take: 5 },
        jobPosting: { select: { id: true, company: true, title: true, sourceId: true } },
        jobProfileMatch: { select: { id: true, overallScore: true, jobSearchProfileId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.jobProfileMatch.findMany({
      where: user?.id ? { jobSearchProfile: { userId: user.id } } : {},
      select: {
        id: true,
        jobPostingId: true,
        jobSearchProfileId: true,
        status: true,
        overallScore: true,
        updatedAt: true,
        jobPosting: { select: { company: true, title: true, duplicateGroupId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    prisma.jobSuppression.findMany({
      where: whereUser,
      select: {
        id: true,
        kind: true,
        canonicalKey: true,
        companyKey: true,
        titleFamilyKey: true,
        jobPostingId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.applicationAutomationRun.findMany({
      where: whereUser,
      select: {
        id: true,
        applicationId: true,
        jobPostingId: true,
        status: true,
        blockerType: true,
        currentNode: true,
        startedAt: true,
      },
      orderBy: { startedAt: "desc" },
      take: 300,
    }),
    prisma.agentQualityExample.findMany({
      where: {
        ...(user?.id ? { userId: user.id } : {}),
        metadataJson: { path: ["source"], equals: OUTCOME_SIGNAL_PREFIX },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.agentImprovementProposal.findMany({
      where: {
        ...(user?.id ? { userId: user.id } : {}),
        target: { in: ["JOB_SEARCH", "JOB_MATCHING", "RECRUITING_AGENCY", "APPLICATION_ASSISTANT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { user, applications, matches, suppressions, automationRuns, qualityExamples, proposals };
}

async function createOutcomeQualityExample(userId: string, signal: OutcomeCalibrationSignal, data: LoadedData) {
  const existing = await prisma.agentQualityExample.findFirst({
    where: {
      userId,
      target: signal.target,
      failureCategory: signal.category,
      metadataJson: { path: ["signalKey"], equals: signal.key },
    },
  });
  if (existing) return false;

  const dataset = await ensureAgentQualityDataset(userId, signal.target);
  await prisma.agentQualityExample.create({
    data: {
      userId,
      datasetId: dataset.id,
      target: signal.target,
      source: "BACKFILL",
      title: signal.title,
      summary: signal.summary,
      failureCategory: signal.category,
      inputJson: sanitizeTraceInput({
        applications: data.applications.length,
        matches: data.matches.length,
        suppressions: data.suppressions.length,
      }),
      expectedJson: sanitizeTraceInput({
        expectedBehavior: "Future agent runs should avoid repeating this outcome pattern.",
      }),
      actualJson: sanitizeTraceInput({
        count: signal.count,
        severity: signal.severity,
      }),
      metadataJson: sanitizeTraceInput({
        source: OUTCOME_SIGNAL_PREFIX,
        signalKey: signal.key,
        target: signal.target,
        category: signal.category,
      }) as Prisma.InputJsonValue,
    },
  });
  return true;
}

function buildSignals(summary: OutcomeCalibrationReport["summary"]): OutcomeCalibrationSignal[] {
  const signals: OutcomeCalibrationSignal[] = [];
  if (summary.resurfacedSuppressedJobs > 0) {
    signals.push(signal("suppression_resurfacing", "JOB_SEARCH", "suppression_resurfacing", "Suppressed jobs resurfaced", `${summary.resurfacedSuppressedJobs} rejected or applied job(s) appear to have resurfaced in active search results.`, "needs_review", summary.resurfacedSuppressedJobs));
  }
  if (summary.duplicateActiveGroups > 0) {
    signals.push(signal("duplicate_active_groups", "JOB_SEARCH", "dedupe_ineffective", "Active duplicate groups remain", `${summary.duplicateActiveGroups} duplicate group(s) still have multiple active matches.`, "watch", summary.duplicateActiveGroups));
  }
  if (summary.rejectedHighScoreMatches > 0) {
    signals.push(signal("rejected_high_score_matches", "JOB_MATCHING", "high_score_user_rejected", "High-score matches were rejected", `${summary.rejectedHighScoreMatches} match(es) scored 85+ but were rejected.`, "needs_review", summary.rejectedHighScoreMatches));
  }
  if (summary.applied >= 5 && summary.callbackRate === 0) {
    signals.push(signal("zero_callback_rate", "RECRUITING_AGENCY", "low_callback_yield", "No callback signal after applications", `${summary.applied} applied job(s) have no positive callback outcome yet.`, "watch", summary.applied));
  }
  if (summary.assistantFailures > 0) {
    signals.push(signal("assistant_failures", "APPLICATION_ASSISTANT", "assistant_outcome_failure", "Assistant failures need review", `${summary.assistantFailures} assistant run(s) failed, blocked, or needed user recovery.`, "watch", summary.assistantFailures));
  }
  return signals;
}

function workflow(target: AgentQualityTarget, score: number | null, summary: string, metrics: Record<string, number | null>) {
  return {
    target,
    status: score === null ? "insufficient_data" : score < 65 ? "needs_review" : score < 82 ? "watch" : "healthy" as OutcomeCalibrationStatus,
    score,
    summary,
    metrics,
  };
}

function scoreSearch(summary: OutcomeCalibrationReport["summary"]) {
  if (!summary.applications && !summary.rejectedHighScoreMatches && !summary.duplicateActiveGroups && !summary.resurfacedSuppressedJobs) return null;
  return clamp(100 - (summary.resurfacedSuppressedJobs * 25) - (summary.duplicateActiveGroups * 10));
}

function scoreMatching(summary: OutcomeCalibrationReport["summary"]) {
  if (!summary.applications && !summary.rejectedHighScoreMatches) return null;
  return clamp(100 - (summary.rejectedHighScoreMatches * 18) - Math.min(summary.negativeOutcomes * 4, 25));
}

function scoreAgency(summary: OutcomeCalibrationReport["summary"]) {
  if (summary.applied === 0) return null;
  const callbackBonus = summary.callbackRate ?? 0;
  return clamp(60 + Math.min(callbackBonus, 35) - Math.min(summary.negativeOutcomes * 3, 20));
}

function scoreAssistant(summary: OutcomeCalibrationReport["summary"]) {
  if (!summary.applications && !summary.assistantFailures) return null;
  return clamp(100 - (summary.assistantFailures * 15));
}

function searchSummary(summary: OutcomeCalibrationReport["summary"]) {
  if (summary.resurfacedSuppressedJobs) return "Search needs review because rejected or applied jobs appear to be resurfacing.";
  if (summary.duplicateActiveGroups) return "Search is mostly working, but active duplicate groups still need cleanup.";
  return "Search outcome signals do not show resurfacing or duplicate noise.";
}

function matchingSummary(summary: OutcomeCalibrationReport["summary"]) {
  if (summary.rejectedHighScoreMatches) return "Matching needs calibration because high-score jobs were rejected.";
  return "Matching outcome signals do not show high-score rejection noise.";
}

function agencySummary(summary: OutcomeCalibrationReport["summary"]) {
  if (!summary.applied) return "Agency outcome quality needs applied jobs before callback rate can be measured.";
  if (summary.callbackRate === 0) return "Agency approvals have no callback signal yet.";
  return `Agency approvals show a ${summary.callbackRate}% callback signal.`;
}

function assistantSummary(summary: OutcomeCalibrationReport["summary"]) {
  if (summary.assistantFailures) return "Assistant outcome quality is affected by failed or blocked runs.";
  return "Assistant outcome signals do not show failed or blocked runs.";
}

function signal(key: string, target: AgentQualityTarget, category: string, title: string, summary: string, severity: OutcomeCalibrationStatus, count: number): OutcomeCalibrationSignal {
  return { key, target, category, title, summary, severity, count };
}

function activeDuplicateGroups(matches: LoadedData["matches"]) {
  const groups = new Map<string, number>();
  for (const match of matches) {
    const groupId = match.jobPosting.duplicateGroupId;
    if (!groupId || !ACTIVE_MATCH_STATUSES.includes(match.status as typeof ACTIVE_MATCH_STATUSES[number])) continue;
    groups.set(groupId, (groups.get(groupId) ?? 0) + 1);
  }
  return Array.from(groups.values()).filter((count) => count > 1).length;
}

function isAppliedApplication(application: LoadedData["applications"][number]) {
  return APPLIED_STATUSES.includes(application.status as typeof APPLIED_STATUSES[number]) || application.outcomes.some((outcome) => outcome.outcome === "APPLIED");
}

function isPositiveApplication(application: LoadedData["applications"][number]) {
  return POSITIVE_STATUSES.includes(application.status as typeof POSITIVE_STATUSES[number])
    || application.outcomes.some((outcome) => ["RECRUITER_SCREEN", "TECH_SCREEN", "ONSITE", "FINAL", "OFFER"].includes(outcome.outcome));
}

function isNegativeApplication(application: LoadedData["applications"][number]) {
  return NEGATIVE_STATUSES.includes(application.status as typeof NEGATIVE_STATUSES[number])
    || application.outcomes.some((outcome) => ["REJECTED", "GHOSTED", "CLOSED"].includes(outcome.outcome));
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
