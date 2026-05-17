import type { AgentImprovementProposalStatus, AgentQualityTarget, Prisma, SkillAdjustmentRiskLevel } from "@prisma/client";
import { sanitizeTraceInput } from "@/lib/observability/langsmith";
import { ensureAgentQualityDataset, proposeImprovementsFromFailedExamples } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

const OUTCOME_SIGNAL_PREFIX = "outcome_calibration";
const ACTIVE_MATCH_STATUSES = ["discovered", "needs_review", "approved", "saved_for_later", "ready_to_apply", "resume_generated", "cover_letter_generated"] as const;
const APPLIED_STATUSES = ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"] as const;
const POSITIVE_STATUSES = ["screening", "interviewing", "offer"] as const;
const NEGATIVE_STATUSES = ["rejected", "rejected_by_company", "archived"] as const;
const OUTCOME_SNAPSHOT_THROTTLE_MS = 30 * 60 * 1000;

export type OutcomeCalibrationRefreshSource =
  | "settings_manual"
  | "job_rejected"
  | "application_outcome"
  | "email_outcome"
  | "assistant_state"
  | "search_state";

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

export type OutcomeCalibrationReviewAction = {
  id: string;
  category: "pause_or_review_source" | "tighten_profile" | "resolve_duplicates" | "repair_suppression" | "review_assistant_failures";
  severity: "info" | "watch" | "needs_review";
  title: string;
  summary: string;
  rationale: string;
  affectedCount: number;
  targetType: "source" | "profile" | "job" | "duplicate_group" | "application" | "settings";
  targetId: string | null;
  href: string;
  proposal?: {
    id: string;
    status: AgentImprovementProposalStatus;
    riskLevel: SkillAdjustmentRiskLevel;
    target: AgentQualityTarget;
    type: string;
    title: string;
    activationLabel: "learning_active" | "activates_learning" | "review_only";
    createdAt: Date;
    updatedAt: Date;
  } | null;
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
  actions: OutcomeCalibrationReviewAction[];
  details: {
    resurfacedSuppressedJobs: Array<{
      suppressionId: string;
      jobId: string | null;
      matchId: string | null;
      applicationId: string | null;
      company: string;
      title: string;
      suppressionKind: string;
      suppressionSource: string;
      matchStatus: string | null;
      score: number | null;
      createdAt: Date;
    }>;
    activeDuplicateGroups: Array<{
      duplicateGroupId: string;
      company: string;
      title: string;
      activeMatchCount: number;
      jobs: Array<{ jobId: string; matchId: string; company: string; title: string; status: string; score: number }>;
    }>;
    rejectedHighScoreMatches: Array<{
      matchId: string;
      jobId: string;
      company: string;
      title: string;
      score: number;
      profileId: string;
      profileName: string;
      rejectedAt: Date;
    }>;
    assistantFailures: Array<{
      automationRunId: string;
      applicationId: string;
      jobId: string;
      company: string;
      title: string;
      status: string;
      blockerType: string | null;
      blockerMessage: string | null;
      currentNode: string | null;
      startedAt: Date;
    }>;
    profileBreakdown: Array<{
      profileId: string;
      profileName: string;
      activeMatches: number;
      rejectedHighScoreMatches: number;
      applied: number;
      positiveOutcomes: number;
      callbackRate: number | null;
    }>;
    sourceBreakdown: Array<{
      sourceId: string | null;
      sourceName: string;
      sourceType: string;
      applications: number;
      activeMatches: number;
      positiveOutcomes: number;
      callbackRate: number | null;
      noisySignals: number;
    }>;
  };
};

type LoadedData = Awaited<ReturnType<typeof loadOutcomeData>>;

export type OutcomeTrendDirection = "improving" | "flat" | "regressing" | "insufficient_data";

export type OutcomeCalibrationTrendReport = {
  snapshots: Array<{
    id: string;
    source: string;
    createdAt: Date;
    summary: OutcomeCalibrationReport["summary"];
    workflows: OutcomeCalibrationReport["workflows"];
  }>;
  metrics: Array<{
    key: keyof OutcomeCalibrationReport["summary"];
    label: string;
    latest: number | null;
    previous: number | null;
    delta: number | null;
    direction: OutcomeTrendDirection;
  }>;
  workflows: Array<{
    target: AgentQualityTarget;
    latestScore: number | null;
    previousScore: number | null;
    delta: number | null;
    direction: OutcomeTrendDirection;
  }>;
};

export type OutcomeRegressionProposalResult = {
  scanned: number;
  created: number;
  existing: number;
  proposals: Array<{
    id: string;
    trendKey: string;
    status: "created" | "existing";
    proposalStatus: AgentImprovementProposalStatus;
    target: AgentQualityTarget;
  }>;
};

export type OutcomeRegressionTriagePriority = "high" | "medium" | "low";

export type OutcomeRegressionTriageItem = {
  proposalId: string;
  status: AgentImprovementProposalStatus;
  target: AgentQualityTarget;
  riskLevel: SkillAdjustmentRiskLevel;
  title: string;
  summary: string;
  priority: OutcomeRegressionTriagePriority;
  ownerArea: string;
  reviewHref: string;
  reason: string;
  trendKey: string;
  signalType: string;
  latestSnapshotId: string | null;
  latest: number | null;
  previous: number | null;
  delta: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getOutcomeCalibration(userId?: string | null): Promise<OutcomeCalibrationReport> {
  const data = await loadOutcomeData(userId);
  return buildOutcomeCalibrationReport(data);
}

export async function recomputeOutcomeCalibration(
  userId?: string | null,
  options: { source?: OutcomeCalibrationRefreshSource } = {},
) {
  const data = await loadOutcomeData(userId);
  const report = buildOutcomeCalibrationReport(data);
  const ownerId = userId ?? data.user?.id;
  if (!ownerId) return { ...report, createdExamples: 0, proposals: 0 };

  let createdExamples = 0;
  for (const signal of report.signals.filter((item) => item.severity === "needs_review" || item.severity === "watch")) {
    const created = await createOutcomeQualityExample(ownerId, signal, data, options.source ?? "settings_manual");
    if (created) createdExamples += 1;
  }

  let proposals = 0;
  for (const target of Array.from(new Set(report.signals.map((signal) => signal.target)))) {
    const result = await proposeImprovementsFromFailedExamples(ownerId, target);
    proposals += result.created;
  }

  await createOutcomeCalibrationSnapshot(ownerId, options.source ?? "settings_manual", report, {
    throttle: (options.source ?? "settings_manual") !== "settings_manual",
  }).catch((error) => {
    console.warn("Outcome calibration snapshot failed.", error);
  });

  return { ...report, createdExamples, proposals };
}

export async function getOutcomeCalibrationTrends(userId?: string | null): Promise<OutcomeCalibrationTrendReport> {
  const user = userId ? { id: userId } : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user?.id) return { snapshots: [], metrics: buildMetricTrends(null, null), workflows: buildWorkflowTrends(null, null) };

  const snapshots = await prisma.outcomeCalibrationSnapshot.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const normalized = snapshots.map((snapshot) => ({
    id: snapshot.id,
    source: snapshot.source,
    createdAt: snapshot.createdAt,
    summary: summaryJson(snapshot.summaryJson),
    workflows: workflowsJson(snapshot.workflowsJson),
  }));
  const latest = normalized[0] ?? null;
  const previous = normalized.find((snapshot) => snapshot.id !== latest?.id) ?? null;

  return {
    snapshots: normalized,
    metrics: buildMetricTrends(latest?.summary ?? null, previous?.summary ?? null),
    workflows: buildWorkflowTrends(latest?.workflows ?? null, previous?.workflows ?? null),
  };
}

export async function proposeOutcomeTrendRegressionReviews(userId?: string | null): Promise<OutcomeRegressionProposalResult> {
  const user = userId ? { id: userId } : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user?.id) return { scanned: 0, created: 0, existing: 0, proposals: [] };

  const trends = await getOutcomeCalibrationTrends(user.id);
  const latestSnapshotId = trends.snapshots[0]?.id ?? null;
  if (!latestSnapshotId || trends.snapshots.length < 2) return { scanned: 0, created: 0, existing: 0, proposals: [] };

  const candidates = regressionCandidates(trends);
  let created = 0;
  let existing = 0;
  const proposals: OutcomeRegressionProposalResult["proposals"] = [];

  for (const candidate of candidates) {
    const triage = triageForRegressionCandidate(candidate);
    const current = await prisma.agentImprovementProposal.findFirst({
      where: {
        userId: user.id,
        target: candidate.target,
        AND: [
          { metadataJson: { path: ["source"], equals: "outcome_trend_regression" } },
          { metadataJson: { path: ["trendKey"], equals: candidate.trendKey } },
          { metadataJson: { path: ["latestSnapshotId"], equals: latestSnapshotId } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, target: true },
    });
    if (current) {
      existing += 1;
      proposals.push({ id: current.id, trendKey: candidate.trendKey, status: "existing", proposalStatus: current.status, target: current.target });
      continue;
    }

    const proposal = await prisma.agentImprovementProposal.create({
      data: {
        userId: user.id,
        target: candidate.target,
        type: candidate.type,
        status: "PROPOSED",
        riskLevel: "HIGH",
        title: candidate.title,
        summary: candidate.summary,
        rationale: "Outcome trend regression proposals are review-only. Inspect the underlying trend and related outcome details before changing agent behavior.",
        affectedExampleIds: [],
        patchJson: {
          category: candidate.category,
          policy: "proposal_only",
          recommendedChange: candidate.title,
          trendKey: candidate.trendKey,
          latestSnapshotId,
        },
        metadataJson: {
          source: "outcome_trend_regression",
          trendKey: candidate.trendKey,
          trendKind: candidate.kind,
          latestSnapshotId,
          latest: candidate.latest,
          previous: candidate.previous,
          delta: candidate.delta,
          triage,
        },
      },
      select: { id: true, status: true, target: true },
    });
    created += 1;
    proposals.push({ id: proposal.id, trendKey: candidate.trendKey, status: "created", proposalStatus: proposal.status, target: proposal.target });
  }

  return { scanned: candidates.length, created, existing, proposals };
}

export async function getOutcomeRegressionTriage(userId?: string | null): Promise<OutcomeRegressionTriageItem[]> {
  const user = userId ? { id: userId } : await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user?.id) return [];

  const proposals = await prisma.agentImprovementProposal.findMany({
    where: {
      userId: user.id,
      status: "PROPOSED",
      metadataJson: { path: ["source"], equals: "outcome_trend_regression" },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
  });

  return proposals
    .map((proposal) => triageItemForProposal(proposal))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function proposeOutcomeReviewActionImprovements(userId?: string | null) {
  const data = await loadOutcomeData(userId);
  const ownerId = userId ?? data.user?.id;
  if (!ownerId) return { scanned: 0, created: 0, existing: 0, proposals: [] };

  const report = buildOutcomeCalibrationReport(data);
  let created = 0;
  let existing = 0;
  const proposals: Array<{
    id: string;
    actionId: string;
    status: "created" | "existing";
    proposalStatus: AgentImprovementProposalStatus;
    riskLevel: SkillAdjustmentRiskLevel;
    target: AgentQualityTarget;
    type: string;
  }> = [];

  for (const action of report.actions.filter((item) => item.severity === "watch" || item.severity === "needs_review")) {
    const plan = proposalPlanForReviewAction(action);
    const current = await prisma.agentImprovementProposal.findFirst({
      where: {
        userId: ownerId,
        target: plan.target,
        AND: [
          { metadataJson: { path: ["source"], equals: "outcome_review_action" } },
          { metadataJson: { path: ["actionCategory"], equals: action.category } },
          { metadataJson: { path: ["targetType"], equals: action.targetType } },
          { metadataJson: { path: ["targetId"], equals: action.targetId ?? action.id } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, riskLevel: true, target: true, type: true },
    });
    if (current) {
      existing += 1;
      proposals.push({
        id: current.id,
        actionId: action.id,
        status: "existing",
        proposalStatus: current.status,
        riskLevel: current.riskLevel,
        target: current.target,
        type: current.type,
      });
      continue;
    }

    const proposal = await prisma.agentImprovementProposal.create({
      data: {
        userId: ownerId,
        target: plan.target,
        type: plan.type,
        status: "PROPOSED",
        riskLevel: plan.riskLevel,
        title: plan.title,
        summary: action.summary,
        rationale: `${action.rationale} This proposal was promoted from outcome calibration and must be reviewed before any behavior changes are accepted.`,
        affectedExampleIds: [],
        patchJson: {
          category: plan.category,
          policy: "proposal_only",
          recommendedChange: plan.title,
          actionId: action.id,
          href: action.href,
        },
        metadataJson: {
          source: "outcome_review_action",
          actionId: action.id,
          actionCategory: action.category,
          actionSeverity: action.severity,
          targetType: action.targetType,
          targetId: action.targetId ?? action.id,
          affectedCount: action.affectedCount,
          href: action.href,
        },
      },
      select: { id: true, status: true, riskLevel: true, target: true, type: true },
    });
    created += 1;
    proposals.push({
      id: proposal.id,
      actionId: action.id,
      status: "created",
      proposalStatus: proposal.status,
      riskLevel: proposal.riskLevel,
      target: proposal.target,
      type: proposal.type,
    });
  }

  return { scanned: report.actions.length, created, existing, proposals };
}

export function refreshOutcomeCalibration(input: { userId?: string | null; source: OutcomeCalibrationRefreshSource }) {
  void recomputeOutcomeCalibration(input.userId, { source: input.source }).catch((error) => {
    console.warn("Outcome calibration refresh failed.", error);
  });
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
  const details = buildDetails(data);

  return {
    summary,
    workflows,
    signals: buildSignals(summary),
    details,
    actions: linkReviewActionProposals(buildReviewActions(details), data.proposals),
  };
}

async function createOutcomeCalibrationSnapshot(
  userId: string,
  source: OutcomeCalibrationRefreshSource,
  report: OutcomeCalibrationReport,
  options: { throttle: boolean },
) {
  if (options.throttle) {
    const recent = await prisma.outcomeCalibrationSnapshot.findFirst({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - OUTCOME_SNAPSHOT_THROTTLE_MS) },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (recent) return null;
  }

  return prisma.outcomeCalibrationSnapshot.create({
    data: {
      userId,
      source,
      summaryJson: sanitizeTraceInput(report.summary) as Prisma.InputJsonValue,
      workflowsJson: sanitizeTraceInput(report.workflows) as Prisma.InputJsonValue,
      signalsJson: sanitizeTraceInput(report.signals) as Prisma.InputJsonValue,
      actionsJson: sanitizeTraceInput(report.actions.map((action) => ({
        id: action.id,
        category: action.category,
        severity: action.severity,
        affectedCount: action.affectedCount,
        targetType: action.targetType,
        targetId: action.targetId,
        proposalStatus: action.proposal?.status ?? null,
      }))) as Prisma.InputJsonValue,
    },
  });
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
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            sourceId: true,
            source: { select: { id: true, name: true, type: true } },
          },
        },
        jobProfileMatch: {
          select: {
            id: true,
            overallScore: true,
            jobSearchProfileId: true,
            jobSearchProfile: { select: { id: true, name: true } },
          },
        },
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
        jobPosting: {
          select: {
            company: true,
            title: true,
            duplicateGroupId: true,
            source: { select: { id: true, name: true, type: true } },
          },
        },
        jobSearchProfile: { select: { id: true, name: true } },
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
        jobProfileMatchId: true,
        applicationId: true,
        source: true,
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
        blockerMessage: true,
        jobPosting: { select: { company: true, title: true } },
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

function buildDetails(data: LoadedData): OutcomeCalibrationReport["details"] {
  return {
    resurfacedSuppressedJobs: resurfacedSuppressedJobDetails(data),
    activeDuplicateGroups: activeDuplicateGroupDetails(data.matches),
    rejectedHighScoreMatches: rejectedHighScoreMatchDetails(data.matches),
    assistantFailures: assistantFailureDetails(data.automationRuns),
    profileBreakdown: profileBreakdown(data),
    sourceBreakdown: sourceBreakdown(data),
  };
}

function buildReviewActions(details: OutcomeCalibrationReport["details"]): OutcomeCalibrationReviewAction[] {
  const actions: OutcomeCalibrationReviewAction[] = [];

  actions.push(...details.sourceBreakdown
    .filter((source) => source.noisySignals >= 1 || (source.activeMatches >= 8 && (source.callbackRate ?? 0) === 0))
    .slice(0, 3)
    .map((source) => ({
      id: `source:${source.sourceId ?? source.sourceName}`,
      category: "pause_or_review_source" as const,
      severity: source.noisySignals >= 2 ? "needs_review" as const : "watch" as const,
      title: `Review source: ${source.sourceName}`,
      summary: `${source.sourceName} has ${source.activeMatches} active match${source.activeMatches === 1 ? "" : "es"}, ${source.noisySignals} noisy signal${source.noisySignals === 1 ? "" : "s"}, and ${source.callbackRate === null ? "no callback data" : `${source.callbackRate}% callback`}.`,
      rationale: "Sources with noisy matches or weak callback signal should be inspected before continuing to scale discovery from that source.",
      affectedCount: Math.max(source.noisySignals, source.activeMatches),
      targetType: "source" as const,
      targetId: source.sourceId,
      href: "/sources",
    })));

  actions.push(...details.profileBreakdown
    .filter((profile) => profile.rejectedHighScoreMatches >= 1 || (profile.applied >= 5 && (profile.callbackRate ?? 0) === 0) || profile.activeMatches >= 15)
    .slice(0, 3)
    .map((profile) => ({
      id: `profile:${profile.profileId}`,
      category: "tighten_profile" as const,
      severity: profile.rejectedHighScoreMatches >= 2 || (profile.applied >= 5 && (profile.callbackRate ?? 0) === 0) ? "needs_review" as const : "watch" as const,
      title: `Tighten profile: ${profile.profileName}`,
      summary: `${profile.profileName} has ${profile.rejectedHighScoreMatches} rejected high-score match${profile.rejectedHighScoreMatches === 1 ? "" : "es"}, ${profile.activeMatches} active match${profile.activeMatches === 1 ? "" : "es"}, and ${profile.callbackRate === null ? "no callback data" : `${profile.callbackRate}% callback`}.`,
      rationale: "Profiles with high-score rejections, broad active volume, or no callback signal may need tighter titles, keywords, exclusions, or thresholds.",
      affectedCount: Math.max(profile.rejectedHighScoreMatches, profile.activeMatches, profile.applied),
      targetType: "profile" as const,
      targetId: profile.profileId,
      href: "/profiles",
    })));

  actions.push(...details.activeDuplicateGroups.slice(0, 3).map((group) => ({
    id: `duplicate:${group.duplicateGroupId}`,
    category: "resolve_duplicates" as const,
    severity: group.activeMatchCount >= 3 ? "needs_review" as const : "watch" as const,
    title: `Resolve duplicate group: ${group.company}`,
    summary: `${group.activeMatchCount} active matches look like duplicates for ${group.company} - ${group.title}.`,
    rationale: "Active duplicate groups make the review queue noisy and can cause the same role to resurface after rejection.",
    affectedCount: group.activeMatchCount,
    targetType: "duplicate_group" as const,
    targetId: group.duplicateGroupId,
    href: group.jobs[0]?.jobId ? `/jobs/${group.jobs[0].jobId}` : "/jobs",
  })));

  actions.push(...details.resurfacedSuppressedJobs.slice(0, 3).map((job) => ({
    id: `suppression:${job.suppressionId}`,
    category: "repair_suppression" as const,
    severity: "needs_review" as const,
    title: `Repair resurfacing: ${job.company}`,
    summary: `${job.company} - ${job.title} was suppressed but appears active again as ${job.matchStatus ?? "unknown"}.`,
    rationale: "Rejected or applied jobs should not return to active review; inspect suppression and duplicate matching for this role.",
    affectedCount: 1,
    targetType: "job" as const,
    targetId: job.jobId,
    href: job.jobId ? `/jobs/${job.jobId}` : "/jobs",
  })));

  actions.push(...details.assistantFailures.slice(0, 3).map((run) => ({
    id: `assistant:${run.automationRunId}`,
    category: "review_assistant_failures" as const,
    severity: run.status === "FAILED" ? "needs_review" as const : "watch" as const,
    title: `Review assistant run: ${run.company}`,
    summary: `${run.company} - ${run.title} ended as ${run.status.toLowerCase().replace(/_/g, " ")}${run.blockerType ? ` with ${run.blockerType.replace(/_/g, " ")}` : ""}.`,
    rationale: "Repeated assistant blockers reduce application throughput and should be reviewed before trusting more automation.",
    affectedCount: 1,
    targetType: "application" as const,
    targetId: run.applicationId,
    href: `/applications/${run.applicationId}`,
  })));

  return actions.slice(0, 12);
}

function linkReviewActionProposals(
  actions: OutcomeCalibrationReviewAction[],
  proposals: LoadedData["proposals"],
): OutcomeCalibrationReviewAction[] {
  return actions.map((action) => {
    const targetId = action.targetId ?? action.id;
    const proposal = proposals.find((item) => {
      const metadata = objectJson(item.metadataJson);
      return metadata.source === "outcome_review_action"
        && metadata.actionCategory === action.category
        && metadata.targetType === action.targetType
        && metadata.targetId === targetId;
    });
    if (!proposal) return { ...action, proposal: null };
    return {
      ...action,
      proposal: {
        id: proposal.id,
        status: proposal.status,
        riskLevel: proposal.riskLevel,
        target: proposal.target,
        type: proposal.type,
        title: proposal.title,
        activationLabel: actionProposalActivationLabel(proposal),
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
      },
    };
  });
}

function actionProposalActivationLabel(proposal: LoadedData["proposals"][number]): "learning_active" | "activates_learning" | "review_only" {
  const metadata = objectJson(proposal.metadataJson);
  const activation = objectJson(metadata.activation);
  if (activation.status === "created" || activation.status === "already_active") return "learning_active";
  const category = String(metadata.failureCategory ?? objectJson(proposal.patchJson).category ?? "");
  if (
    proposal.riskLevel === "LOW"
    && proposal.type !== "PROMPT"
    && (
      (proposal.target === "JOB_MATCHING" && category === "high_score_user_rejected") ||
      (proposal.target === "JOB_SEARCH" && ["dedupe_ineffective", "low_saved_yield"].includes(category)) ||
      (proposal.target === "APPLICATION_ASSISTANT" && ["cover_letter_field", "field_classification"].includes(category)) ||
      (proposal.target === "RECRUITING_AGENCY" && ["CANDIDATE_FAILURE", "candidate_failure"].includes(category))
    )
  ) return "activates_learning";
  return "review_only";
}

function proposalPlanForReviewAction(action: OutcomeCalibrationReviewAction): {
  target: AgentQualityTarget;
  type: "PROMPT" | "SKILL" | "CLASSIFIER" | "WORKFLOW";
  riskLevel: "LOW" | "HIGH";
  category: string;
  title: string;
} {
  if (action.category === "resolve_duplicates") {
    return {
      target: "JOB_SEARCH",
      type: "WORKFLOW",
      riskLevel: "LOW",
      category: "dedupe_ineffective",
      title: action.title,
    };
  }
  if (action.category === "repair_suppression") {
    return {
      target: "JOB_SEARCH",
      type: "WORKFLOW",
      riskLevel: "HIGH",
      category: "suppression_resurfacing",
      title: action.title,
    };
  }
  if (action.category === "tighten_profile") {
    return {
      target: "JOB_MATCHING",
      type: "CLASSIFIER",
      riskLevel: "HIGH",
      category: "outcome_tighten_profile",
      title: action.title,
    };
  }
  if (action.category === "review_assistant_failures") {
    return {
      target: "APPLICATION_ASSISTANT",
      type: "WORKFLOW",
      riskLevel: "HIGH",
      category: "assistant_outcome_failure",
      title: action.title,
    };
  }
  return {
    target: "JOB_SEARCH",
    type: "WORKFLOW",
    riskLevel: "HIGH",
    category: "outcome_source_review",
    title: action.title,
  };
}

function resurfacedSuppressedJobDetails(data: LoadedData): OutcomeCalibrationReport["details"]["resurfacedSuppressedJobs"] {
  return data.suppressions.flatMap((suppression) => {
    if (!suppression.jobPostingId) return [];
    const match = data.matches.find((item) => item.jobPostingId === suppression.jobPostingId && ACTIVE_MATCH_STATUSES.includes(item.status as typeof ACTIVE_MATCH_STATUSES[number]));
    if (!match) return [];
    return [{
      suppressionId: suppression.id,
      jobId: suppression.jobPostingId,
      matchId: suppression.jobProfileMatchId ?? match.id,
      applicationId: suppression.applicationId,
      company: match.jobPosting.company,
      title: match.jobPosting.title,
      suppressionKind: suppression.kind,
      suppressionSource: suppression.source,
      matchStatus: match.status,
      score: match.overallScore,
      createdAt: suppression.createdAt,
    }];
  }).slice(0, 25);
}

function activeDuplicateGroupDetails(matches: LoadedData["matches"]): OutcomeCalibrationReport["details"]["activeDuplicateGroups"] {
  const groups = new Map<string, LoadedData["matches"]>();
  for (const match of matches) {
    const groupId = match.jobPosting.duplicateGroupId;
    if (!groupId || !ACTIVE_MATCH_STATUSES.includes(match.status as typeof ACTIVE_MATCH_STATUSES[number])) continue;
    groups.set(groupId, [...(groups.get(groupId) ?? []), match]);
  }
  return Array.from(groups.entries())
    .filter(([, groupMatches]) => groupMatches.length > 1)
    .map(([duplicateGroupId, groupMatches]) => ({
      duplicateGroupId,
      company: groupMatches[0]?.jobPosting.company ?? "Unknown company",
      title: groupMatches[0]?.jobPosting.title ?? "Unknown role",
      activeMatchCount: groupMatches.length,
      jobs: groupMatches.map((match) => ({
        jobId: match.jobPostingId,
        matchId: match.id,
        company: match.jobPosting.company,
        title: match.jobPosting.title,
        status: match.status,
        score: match.overallScore,
      })),
    }))
    .slice(0, 20);
}

function rejectedHighScoreMatchDetails(matches: LoadedData["matches"]): OutcomeCalibrationReport["details"]["rejectedHighScoreMatches"] {
  return matches
    .filter((match) => match.status === "rejected" && match.overallScore >= 85)
    .map((match) => ({
      matchId: match.id,
      jobId: match.jobPostingId,
      company: match.jobPosting.company,
      title: match.jobPosting.title,
      score: match.overallScore,
      profileId: match.jobSearchProfile.id,
      profileName: match.jobSearchProfile.name,
      rejectedAt: match.updatedAt,
    }))
    .slice(0, 25);
}

function assistantFailureDetails(runs: LoadedData["automationRuns"]): OutcomeCalibrationReport["details"]["assistantFailures"] {
  return runs
    .filter((run) => run.status === "FAILED" || run.status === "NEEDS_USER" || run.blockerType)
    .map((run) => ({
      automationRunId: run.id,
      applicationId: run.applicationId,
      jobId: run.jobPostingId,
      company: run.jobPosting.company,
      title: run.jobPosting.title,
      status: run.status,
      blockerType: run.blockerType,
      blockerMessage: run.blockerMessage,
      currentNode: run.currentNode,
      startedAt: run.startedAt,
    }))
    .slice(0, 25);
}

function profileBreakdown(data: LoadedData): OutcomeCalibrationReport["details"]["profileBreakdown"] {
  const profiles = new Map<string, { profileName: string; activeMatches: number; rejectedHighScoreMatches: number; applied: number; positiveOutcomes: number }>();
  for (const match of data.matches) {
    const current = profiles.get(match.jobSearchProfile.id) ?? {
      profileName: match.jobSearchProfile.name,
      activeMatches: 0,
      rejectedHighScoreMatches: 0,
      applied: 0,
      positiveOutcomes: 0,
    };
    if (ACTIVE_MATCH_STATUSES.includes(match.status as typeof ACTIVE_MATCH_STATUSES[number])) current.activeMatches += 1;
    if (match.status === "rejected" && match.overallScore >= 85) current.rejectedHighScoreMatches += 1;
    profiles.set(match.jobSearchProfile.id, current);
  }
  for (const application of data.applications) {
    const profile = application.jobProfileMatch?.jobSearchProfile;
    if (!profile) continue;
    const current = profiles.get(profile.id) ?? {
      profileName: profile.name,
      activeMatches: 0,
      rejectedHighScoreMatches: 0,
      applied: 0,
      positiveOutcomes: 0,
    };
    if (isAppliedApplication(application)) current.applied += 1;
    if (isPositiveApplication(application)) current.positiveOutcomes += 1;
    profiles.set(profile.id, current);
  }
  return Array.from(profiles.entries())
    .map(([profileId, item]) => ({
      profileId,
      profileName: item.profileName,
      activeMatches: item.activeMatches,
      rejectedHighScoreMatches: item.rejectedHighScoreMatches,
      applied: item.applied,
      positiveOutcomes: item.positiveOutcomes,
      callbackRate: item.applied ? percent(item.positiveOutcomes, item.applied) : null,
    }))
    .sort((left, right) => right.rejectedHighScoreMatches - left.rejectedHighScoreMatches || right.activeMatches - left.activeMatches)
    .slice(0, 20);
}

function sourceBreakdown(data: LoadedData): OutcomeCalibrationReport["details"]["sourceBreakdown"] {
  const sources = new Map<string, { sourceId: string | null; sourceName: string; sourceType: string; applications: number; activeMatches: number; positiveOutcomes: number; applied: number; noisySignals: number }>();
  const keyFor = (source: { id: string; name: string; type: string } | null | undefined) => source?.id ?? "manual";
  const ensure = (source: { id: string; name: string; type: string } | null | undefined) => {
    const key = keyFor(source);
    const item = sources.get(key) ?? {
      sourceId: source?.id ?? null,
      sourceName: source?.name ?? "Manual or unknown",
      sourceType: source?.type ?? "manual",
      applications: 0,
      activeMatches: 0,
      positiveOutcomes: 0,
      applied: 0,
      noisySignals: 0,
    };
    sources.set(key, item);
    return item;
  };
  for (const match of data.matches) {
    const item = ensure(match.jobPosting.source);
    if (ACTIVE_MATCH_STATUSES.includes(match.status as typeof ACTIVE_MATCH_STATUSES[number])) item.activeMatches += 1;
    if (match.status === "rejected" && match.overallScore >= 85) item.noisySignals += 1;
  }
  for (const application of data.applications) {
    const item = ensure(application.jobPosting.source);
    item.applications += 1;
    if (isAppliedApplication(application)) item.applied += 1;
    if (isPositiveApplication(application)) item.positiveOutcomes += 1;
  }
  return Array.from(sources.values())
    .map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      applications: item.applications,
      activeMatches: item.activeMatches,
      positiveOutcomes: item.positiveOutcomes,
      callbackRate: item.applied ? percent(item.positiveOutcomes, item.applied) : null,
      noisySignals: item.noisySignals,
    }))
    .sort((left, right) => right.noisySignals - left.noisySignals || right.activeMatches - left.activeMatches)
    .slice(0, 20);
}

async function createOutcomeQualityExample(
  userId: string,
  signal: OutcomeCalibrationSignal,
  data: LoadedData,
  refreshSource: OutcomeCalibrationRefreshSource,
) {
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
        refreshSource,
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

function objectJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function summaryJson(value: unknown): OutcomeCalibrationReport["summary"] {
  const item = objectJson(value);
  return {
    applications: numberValue(item.applications),
    applied: numberValue(item.applied),
    positiveOutcomes: numberValue(item.positiveOutcomes),
    negativeOutcomes: numberValue(item.negativeOutcomes),
    callbackRate: nullableNumberValue(item.callbackRate),
    rejectedHighScoreMatches: numberValue(item.rejectedHighScoreMatches),
    duplicateActiveGroups: numberValue(item.duplicateActiveGroups),
    resurfacedSuppressedJobs: numberValue(item.resurfacedSuppressedJobs),
    assistantFailures: numberValue(item.assistantFailures),
    qualityExamples: numberValue(item.qualityExamples),
    proposedImprovements: numberValue(item.proposedImprovements),
  };
}

function workflowsJson(value: unknown): OutcomeCalibrationReport["workflows"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const workflow = objectJson(item);
    const target = String(workflow.target ?? "");
    if (!["JOB_SEARCH", "JOB_MATCHING", "RECRUITING_AGENCY", "APPLICATION_ASSISTANT"].includes(target)) return [];
    return [{
      target: target as AgentQualityTarget,
      status: outcomeStatusValue(workflow.status),
      score: nullableNumberValue(workflow.score),
      summary: typeof workflow.summary === "string" ? workflow.summary : "",
      metrics: objectJson(workflow.metrics) as Record<string, number | null>,
    }];
  });
}

function buildMetricTrends(
  latest: OutcomeCalibrationReport["summary"] | null,
  previous: OutcomeCalibrationReport["summary"] | null,
): OutcomeCalibrationTrendReport["metrics"] {
  return [
    metricTrend("callbackRate", "Callback rate", latest?.callbackRate ?? null, previous?.callbackRate ?? null, "higher"),
    metricTrend("rejectedHighScoreMatches", "Rejected high-score", latest?.rejectedHighScoreMatches ?? null, previous?.rejectedHighScoreMatches ?? null, "lower"),
    metricTrend("duplicateActiveGroups", "Duplicate groups", latest?.duplicateActiveGroups ?? null, previous?.duplicateActiveGroups ?? null, "lower"),
    metricTrend("resurfacedSuppressedJobs", "Resurfaced jobs", latest?.resurfacedSuppressedJobs ?? null, previous?.resurfacedSuppressedJobs ?? null, "lower"),
    metricTrend("assistantFailures", "Assistant failures", latest?.assistantFailures ?? null, previous?.assistantFailures ?? null, "lower"),
  ];
}

function buildWorkflowTrends(
  latest: OutcomeCalibrationReport["workflows"] | null,
  previous: OutcomeCalibrationReport["workflows"] | null,
): OutcomeCalibrationTrendReport["workflows"] {
  const targets: AgentQualityTarget[] = ["JOB_SEARCH", "JOB_MATCHING", "RECRUITING_AGENCY", "APPLICATION_ASSISTANT"];
  return targets.map((target) => {
    const latestScore = latest?.find((item) => item.target === target)?.score ?? null;
    const previousScore = previous?.find((item) => item.target === target)?.score ?? null;
    return {
      target,
      latestScore,
      previousScore,
      delta: latestScore === null || previousScore === null ? null : latestScore - previousScore,
      direction: trendDirection(latestScore, previousScore, "higher"),
    };
  });
}

type RegressionCandidate = {
  trendKey: string;
  kind: "metric" | "workflow";
  target: AgentQualityTarget;
  type: "WORKFLOW" | "CLASSIFIER";
  category: string;
  title: string;
  summary: string;
  latest: number | null;
  previous: number | null;
  delta: number | null;
};

type RegressionTriageMetadata = {
  priority: OutcomeRegressionTriagePriority;
  ownerArea: string;
  reviewHref: string;
  reason: string;
  signalType: string;
};

function regressionCandidates(trends: OutcomeCalibrationTrendReport): RegressionCandidate[] {
  if (trends.snapshots.length < 2) return [];
  const metricCandidates = trends.metrics
    .filter((metric) => metric.direction === "regressing")
    .map((metric) => {
      const target = targetForRegressionMetric(metric.key);
      return {
        trendKey: `metric:${String(metric.key)}`,
        kind: "metric" as const,
        target,
        type: typeForRegressionTarget(target),
        category: `trend_${String(metric.key)}`,
        title: `Review regressing outcome trend: ${metric.label}`,
        summary: `${metric.label} changed from ${metric.previous ?? "n/a"} to ${metric.latest ?? "n/a"} across recent outcome snapshots.`,
        latest: metric.latest,
        previous: metric.previous,
        delta: metric.delta,
      };
    });
  const workflowCandidates = trends.workflows
    .filter((workflow) => workflow.direction === "regressing")
    .map((workflow) => ({
      trendKey: `workflow:${workflow.target}`,
      kind: "workflow" as const,
      target: workflow.target,
      type: "WORKFLOW" as const,
      category: "trend_workflow_score",
      title: `Review regressing workflow score: ${workflow.target.toLowerCase().replace(/_/g, " ")}`,
      summary: `${workflow.target.toLowerCase().replace(/_/g, " ")} score changed from ${workflow.previousScore ?? "n/a"} to ${workflow.latestScore ?? "n/a"} across recent outcome snapshots.`,
      latest: workflow.latestScore,
      previous: workflow.previousScore,
      delta: workflow.delta,
    }));
  return [...metricCandidates, ...workflowCandidates];
}

function triageForRegressionCandidate(candidate: RegressionCandidate): RegressionTriageMetadata {
  if (candidate.trendKey === "metric:callbackRate") {
    return {
      priority: "high",
      ownerArea: "Recruiting agency",
      reviewHref: "/outcomes",
      reason: "Callback rate declined, so review sourcing quality, agency approval, and application targeting before accepting more automation.",
      signalType: "callback_decline",
    };
  }
  if (candidate.trendKey === "metric:assistantFailures" || candidate.trendKey === "workflow:APPLICATION_ASSISTANT") {
    return {
      priority: "high",
      ownerArea: "Application assistant",
      reviewHref: "/applications/assistant",
      reason: "Assistant quality regressed, so inspect recent failed or blocked runs before expanding autofill behavior.",
      signalType: "assistant_quality",
    };
  }
  if (candidate.trendKey === "metric:rejectedHighScoreMatches" || candidate.trendKey === "workflow:JOB_MATCHING") {
    return {
      priority: "high",
      ownerArea: "Job matching",
      reviewHref: "/jobs",
      reason: "High-scoring jobs are being rejected or matching quality dropped, so review scoring and rejection feedback patterns.",
      signalType: "matching_quality",
    };
  }
  if (candidate.trendKey === "metric:duplicateActiveGroups" || candidate.trendKey === "metric:resurfacedSuppressedJobs") {
    return {
      priority: "medium",
      ownerArea: "Job search",
      reviewHref: "/jobs",
      reason: "Search hygiene regressed through duplicates or resurfaced suppressed jobs, so review dedupe and suppression behavior.",
      signalType: "search_hygiene",
    };
  }
  if (candidate.trendKey === "workflow:JOB_SEARCH") {
    return {
      priority: "medium",
      ownerArea: "Job search",
      reviewHref: "/settings#settings-outcome-calibration",
      reason: "Job search workflow score dropped, so review sources, profiles, and saved-result yield before changing schedules.",
      signalType: "search_quality",
    };
  }
  return {
    priority: "low",
    ownerArea: candidate.target.toLowerCase().replace(/_/g, " "),
    reviewHref: "/settings#settings-outcome-calibration",
    reason: "A regression was detected, but it needs review before any behavior changes are considered.",
    signalType: "workflow_quality",
  };
}

function triageItemForProposal(proposal: {
  id: string;
  status: AgentImprovementProposalStatus;
  target: AgentQualityTarget;
  riskLevel: SkillAdjustmentRiskLevel;
  title: string;
  summary: string;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): OutcomeRegressionTriageItem {
  const metadata = objectJson(proposal.metadataJson);
  const triage = objectJson(metadata.triage);
  const trendKey = typeof metadata.trendKey === "string" ? metadata.trendKey : "unknown";
  const fallback = triageForRegressionCandidate({
    trendKey,
    kind: metadata.trendKind === "workflow" ? "workflow" : "metric",
    target: proposal.target,
    type: typeForRegressionTarget(proposal.target),
    category: `trend_${trendKey.replace(/[^a-z0-9]+/gi, "_")}`,
    title: proposal.title,
    summary: proposal.summary,
    latest: nullableNumberValue(metadata.latest),
    previous: nullableNumberValue(metadata.previous),
    delta: nullableNumberValue(metadata.delta),
  });
  return {
    proposalId: proposal.id,
    status: proposal.status,
    target: proposal.target,
    riskLevel: proposal.riskLevel,
    title: proposal.title,
    summary: proposal.summary,
    priority: priorityValue(triage.priority) ?? fallback.priority,
    ownerArea: typeof triage.ownerArea === "string" ? triage.ownerArea : fallback.ownerArea,
    reviewHref: typeof triage.reviewHref === "string" ? triage.reviewHref : fallback.reviewHref,
    reason: typeof triage.reason === "string" ? triage.reason : fallback.reason,
    signalType: typeof triage.signalType === "string" ? triage.signalType : fallback.signalType,
    trendKey,
    latestSnapshotId: typeof metadata.latestSnapshotId === "string" ? metadata.latestSnapshotId : null,
    latest: nullableNumberValue(metadata.latest),
    previous: nullableNumberValue(metadata.previous),
    delta: nullableNumberValue(metadata.delta),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

function priorityValue(value: unknown): OutcomeRegressionTriagePriority | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function priorityRank(priority: OutcomeRegressionTriagePriority) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function targetForRegressionMetric(key: keyof OutcomeCalibrationReport["summary"]): AgentQualityTarget {
  if (key === "rejectedHighScoreMatches") return "JOB_MATCHING";
  if (key === "assistantFailures") return "APPLICATION_ASSISTANT";
  if (key === "callbackRate") return "RECRUITING_AGENCY";
  return "JOB_SEARCH";
}

function typeForRegressionTarget(target: AgentQualityTarget): "WORKFLOW" | "CLASSIFIER" {
  return target === "JOB_MATCHING" ? "CLASSIFIER" : "WORKFLOW";
}

function metricTrend(
  key: keyof OutcomeCalibrationReport["summary"],
  label: string,
  latest: number | null,
  previous: number | null,
  better: "higher" | "lower",
): OutcomeCalibrationTrendReport["metrics"][number] {
  return {
    key,
    label,
    latest,
    previous,
    delta: latest === null || previous === null ? null : latest - previous,
    direction: trendDirection(latest, previous, better),
  };
}

function trendDirection(latest: number | null, previous: number | null, better: "higher" | "lower"): OutcomeTrendDirection {
  if (latest === null || previous === null) return "insufficient_data";
  const delta = latest - previous;
  if (Math.abs(delta) < 1) return "flat";
  if (better === "higher") return delta > 0 ? "improving" : "regressing";
  return delta < 0 ? "improving" : "regressing";
}

function outcomeStatusValue(value: unknown): OutcomeCalibrationStatus {
  return value === "healthy" || value === "watch" || value === "needs_review" || value === "insufficient_data"
    ? value
    : "insufficient_data";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
