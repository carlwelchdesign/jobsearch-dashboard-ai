import type { AgentQualityEvaluationStatus, AgentQualityTarget, AgentType, Prisma, SkillAdjustment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LearningImpactStatus = "helping" | "neutral" | "needs_review" | "insufficient_data";

export type LearningImpactItem = {
  adjustmentId: string;
  skillId: string;
  category: string | null;
  proposalId: string | null;
  rationale: string;
  status: LearningImpactStatus;
  impactSummary: string;
  appliedRunCount: number;
  latestAppliedAt: Date | null;
  relatedFailedCount: number;
  relatedNeedsReviewCount: number;
  averageScore: number | null;
  target: AgentQualityTarget | null;
  activeSince: Date;
};

type ImpactAdjustment = Pick<SkillAdjustment, "id" | "skillId" | "rationale" | "patchJson" | "appliedAt" | "createdAt">;

export async function getLearningImpact(userId?: string | null): Promise<LearningImpactItem[]> {
  const adjustments = await prisma.skillAdjustment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      status: "ACTIVE",
    },
    orderBy: { appliedAt: "desc" },
    take: 50,
  });
  const proposalBacked = adjustments.filter((adjustment) => objectValue(adjustment.patchJson).source === "quality_proposal");
  if (!proposalBacked.length) return [];

  const oldestAppliedAt = proposalBacked.reduce((oldest, adjustment) => {
    const appliedAt = adjustment.appliedAt ?? adjustment.createdAt;
    return appliedAt < oldest ? appliedAt : oldest;
  }, proposalBacked[0]?.appliedAt ?? proposalBacked[0]?.createdAt ?? new Date());
  const agentTypes = Array.from(new Set(proposalBacked.map((adjustment) => agentTypeForSkill(adjustment.skillId)).filter(Boolean))) as AgentType[];

  const [runs, learningEvents, evaluations] = await Promise.all([
    agentTypes.length
      ? prisma.agentRun.findMany({
          where: {
            ...(userId ? { userId } : {}),
            agentType: { in: agentTypes },
            createdAt: { gte: oldestAppliedAt },
          },
          orderBy: { createdAt: "desc" },
          take: 300,
        })
      : Promise.resolve([]),
    prisma.agentRunEvent.findMany({
      where: {
        type: "learning_applied",
        createdAt: { gte: oldestAppliedAt },
        ...(userId ? { agentRun: { userId } } : {}),
      },
      include: { agentRun: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.agentQualityEvaluation.findMany({
      where: {
        ...(userId ? { userId } : {}),
        createdAt: { gte: oldestAppliedAt },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return proposalBacked.map((adjustment) => impactForAdjustment(adjustment, runs, learningEvents, evaluations));
}

function impactForAdjustment(
  adjustment: ImpactAdjustment,
  runs: Array<{ id: string; agentType: AgentType; outputJson: Prisma.JsonValue | null; createdAt: Date }>,
  learningEvents: Array<{ agentRunId: string; payloadJson: Prisma.JsonValue; createdAt: Date }>,
  evaluations: Array<{ agentRunId: string | null; target: AgentQualityTarget; status: AgentQualityEvaluationStatus; score: number; failureCategory: string | null; createdAt: Date }>,
): LearningImpactItem {
  const patch = objectValue(adjustment.patchJson);
  const category = typeof patch.category === "string" ? patch.category : null;
  const proposalId = typeof patch.proposalId === "string" ? patch.proposalId : null;
  const activeSince = adjustment.appliedAt ?? adjustment.createdAt;
  const agentType = agentTypeForSkill(adjustment.skillId);
  const target = targetForSkill(adjustment.skillId);

  const appliedRuns = runs.filter((run) => {
    if (agentType && run.agentType !== agentType) return false;
    if (run.createdAt < activeSince) return false;
    const output = objectValue(run.outputJson);
    return Boolean(category && jsonArray(output.appliedLearning).includes(category));
  });
  const eventRuns = learningEvents
    .filter((event) => {
      if (event.createdAt < activeSince) return false;
      const payload = objectValue(event.payloadJson);
      return jsonArray(payload.adjustmentIds).includes(adjustment.id) || Boolean(category && jsonArray(payload.categories).includes(category));
    })
    .map((event) => ({ id: event.agentRunId, createdAt: event.createdAt }));

  const appliedRunIds = new Set([...appliedRuns.map((run) => run.id), ...eventRuns.map((run) => run.id)]);
  const latestAppliedAt = [...appliedRuns.map((run) => run.createdAt), ...eventRuns.map((run) => run.createdAt)].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const relatedEvaluations = evaluations.filter((evaluation) => {
    if (evaluation.createdAt < activeSince) return false;
    if (evaluation.agentRunId && appliedRunIds.has(evaluation.agentRunId)) return true;
    if (target && evaluation.target !== target) return false;
    return Boolean(category && evaluation.failureCategory === category);
  });
  const relatedFailedCount = relatedEvaluations.filter((evaluation) => evaluation.status === "FAILED").length;
  const relatedNeedsReviewCount = relatedEvaluations.filter((evaluation) => evaluation.status === "NEEDS_REVIEW").length;
  const averageScore = relatedEvaluations.length
    ? Math.round(relatedEvaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) / relatedEvaluations.length)
    : null;
  const status = impactStatus({
    appliedRunCount: appliedRunIds.size,
    relatedFailedCount,
    relatedNeedsReviewCount,
    averageScore,
  });

  return {
    adjustmentId: adjustment.id,
    skillId: adjustment.skillId,
    category,
    proposalId,
    rationale: adjustment.rationale,
    status,
    impactSummary: impactSummary(status, appliedRunIds.size, relatedFailedCount, relatedNeedsReviewCount, averageScore),
    appliedRunCount: appliedRunIds.size,
    latestAppliedAt,
    relatedFailedCount,
    relatedNeedsReviewCount,
    averageScore,
    target,
    activeSince,
  };
}

function impactStatus(input: { appliedRunCount: number; relatedFailedCount: number; relatedNeedsReviewCount: number; averageScore: number | null }): LearningImpactStatus {
  if (input.appliedRunCount === 0) return "insufficient_data";
  if (input.relatedFailedCount > 0 || input.relatedNeedsReviewCount >= 2) return "needs_review";
  if (input.appliedRunCount >= 2 && input.averageScore !== null && input.averageScore >= 80) return "helping";
  return "neutral";
}

function impactSummary(status: LearningImpactStatus, appliedRunCount: number, failed: number, needsReview: number, averageScore: number | null) {
  if (status === "insufficient_data") return "This learning rule has not appeared in a later tracked agent run yet.";
  if (status === "needs_review") return `Learning was applied ${appliedRunCount} time(s), with ${failed} failed and ${needsReview} needs-review related evaluation(s).`;
  if (status === "helping") return `Learning was applied ${appliedRunCount} time(s) with an average quality score of ${averageScore}.`;
  return `Learning was applied ${appliedRunCount} time(s); more clean evaluation data is needed before calling it helpful.`;
}

function agentTypeForSkill(skillId: string): AgentType | null {
  const map: Partial<Record<string, AgentType>> = {
    job_fit_scorer: "JOB_FIT_SCORER",
    duplicate_stale_job_detector: "DUPLICATE_STALE_JOB_DETECTOR",
    search_profile_manager: "SEARCH_PROFILE_MANAGER",
    application_qa: "APPLICATION_QA",
  };
  return map[skillId] ?? null;
}

function targetForSkill(skillId: string): AgentQualityTarget | null {
  if (skillId === "job_fit_scorer") return "JOB_MATCHING";
  if (skillId === "duplicate_stale_job_detector" || skillId === "search_profile_manager") return "JOB_SEARCH";
  if (skillId === "application_qa") return "APPLICATION_ASSISTANT";
  if (skillId === "approve_agency_match") return "RECRUITING_AGENCY";
  return null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
