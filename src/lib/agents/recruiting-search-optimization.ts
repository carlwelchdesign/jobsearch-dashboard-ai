import { Prisma, type AgentRun, type JobSearchProfile, type SearchProfileChange } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { buildSearchRunAnalytics, type SearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type SearchOptimizationMode = "diagnose_only" | "active";

export type SearchOptimizationGate = {
  canAutoApply: boolean;
  reasons: string[];
};

export type SearchOptimizationContext = {
  latestRun: {
    id: string;
    startedAt: string;
    jobsFetched: number;
    jobsAfterFilters: number;
    jobsSaved: number;
    analytics: SearchRunAnalytics;
  } | null;
  profiles: SearchOptimizationProfile[];
  gate: SearchOptimizationGate;
};

export type SearchOptimizationProfile = Pick<JobSearchProfile,
  "id" | "name" | "enabled" | "minimumMatchScore" | "maxResultsPerRun" | "keywordsPreferred" | "keywordsExcluded" | "excludedTitles" | "preferredCompanies"
> & {
  latestPerformance: {
    healthScore: number;
    jobsFound: number;
    jobsApproved: number;
    jobsRejected: number;
    applicationsSubmitted: number;
    callbackRate: number;
    duplicateRate: number;
  } | null;
};

export type SearchProfileChangeDraft = {
  searchProfileId: string;
  action: SearchProfileChangeAction;
  riskLevel: "LOW" | "HIGH";
  fieldName: string | null;
  beforeJson: Prisma.InputJsonValue;
  afterJson: Prisma.InputJsonValue;
  rollbackJson: Prisma.InputJsonValue;
  rationale: string;
  expectedMetricsJson: Prisma.InputJsonValue;
  autoApply: boolean;
};

export type SearchProfileChangeAction =
  | "ADD_EXCLUDED_KEYWORDS"
  | "ADD_EXCLUDED_TITLES"
  | "ADD_PREFERRED_KEYWORDS"
  | "ADD_PREFERRED_COMPANIES"
  | "SET_MAX_RESULTS"
  | "SET_MINIMUM_MATCH_SCORE"
  | "PAUSE_PROFILE"
  | "CREATE_PROFILE"
  | "MERGE_PROFILES";

export type SearchOptimizationSummary = {
  optimizationRunId: string;
  agentRunId: string;
  generatedAt: string;
  mode: SearchOptimizationMode;
  targetMetric: "QUALIFIED_YIELD";
  qualifiedYield: number;
  runQualityLabel: string;
  summary: string;
  gate: SearchOptimizationGate;
  specialists: Array<{ role: string; runId: string; status: string; summary: string }>;
  changes: Array<{
    id: string;
    profileId: string;
    profileName: string;
    action: string;
    status: string;
    riskLevel: string;
    rationale: string;
  }>;
  nextActions: string[];
};

type CandidateChange = SearchProfileChangeDraft & {
  profileName: string;
};

export async function runRecruitingSearchOptimization(input: {
  userId: string;
  mode?: SearchOptimizationMode;
  parentRunId?: string | null;
}) {
  return runAgent<typeof input, SearchOptimizationSummary>({
    agentType: "RECRUITING_SEARCH_DIRECTOR",
    input: { ...input, mode: input.mode ?? "active" },
    userId: input.userId,
    parentRunId: input.parentRunId,
    execute: async (run) => {
      const mode = input.mode ?? "active";
      const context = await buildSearchOptimizationContext({ userId: input.userId });
      const specialistRuns = await runSpecialists({ userId: input.userId, parentRunId: run.id, context });
      const candidates = recommendSearchProfileChanges(context);
      const summaryText = summarizeOptimization(context, candidates);

      const optimizationRun = await prisma.searchOptimizationRun.create({
        data: {
          userId: input.userId,
          agentRunId: run.id,
          mode,
          targetMetric: "QUALIFIED_YIELD",
          status: "COMPLETED",
          summary: summaryText,
          metricsJson: metricsJson(context) as Prisma.InputJsonValue,
          recommendations: candidates.map(candidateSummary) as Prisma.InputJsonValue,
        },
      });

      const createdChanges = await Promise.all(candidates.map((candidate) => prisma.searchProfileChange.create({
        data: {
          optimizationRunId: optimizationRun.id,
          userId: input.userId,
          agentRunId: run.id,
          searchProfileId: candidate.searchProfileId,
          action: candidate.action,
          status: candidate.autoApply && mode === "active" && context.gate.canAutoApply ? "PROPOSED" : "REVIEW_ONLY",
          riskLevel: candidate.riskLevel,
          fieldName: candidate.fieldName,
          beforeJson: candidate.beforeJson,
          afterJson: candidate.afterJson,
          rollbackJson: candidate.rollbackJson,
          rationale: candidate.rationale,
          expectedMetricsJson: candidate.expectedMetricsJson,
        },
      })));

      const appliedChanges: SearchProfileChange[] = [];
      if (mode === "active" && context.gate.canAutoApply) {
        for (const change of createdChanges.filter((item) => item.status === "PROPOSED" && item.riskLevel === "LOW")) {
          appliedChanges.push(await applySearchProfileChange(change.id));
        }
      }

      const finalChanges = await prisma.searchProfileChange.findMany({
        where: { optimizationRunId: optimizationRun.id },
        include: { searchProfile: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });

      await prisma.agentRunEvent.create({
        data: {
          agentRunId: run.id,
          type: "search_optimization_completed",
          message: `Recruiting search team created ${finalChanges.length} profile change(s), ${appliedChanges.length} applied automatically.`,
          payloadJson: {
            optimizationRunId: optimizationRun.id,
            appliedChangeIds: appliedChanges.map((change) => change.id),
            gate: context.gate,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        optimizationRunId: optimizationRun.id,
        agentRunId: run.id,
        generatedAt: new Date().toISOString(),
        mode,
        targetMetric: "QUALIFIED_YIELD",
        qualifiedYield: qualifiedYield(context),
        runQualityLabel: context.latestRun?.analytics.runQuality.label ?? "No run data",
        summary: summaryText,
        gate: context.gate,
        specialists: specialistRuns,
        changes: finalChanges.map((change) => ({
          id: change.id,
          profileId: change.searchProfileId,
          profileName: change.searchProfile.name,
          action: change.action,
          status: change.status,
          riskLevel: change.riskLevel,
          rationale: change.rationale,
        })),
        nextActions: nextActions(context, finalChanges),
      };
    },
  });
}

export async function buildSearchOptimizationContext({ userId }: { userId: string }): Promise<SearchOptimizationContext> {
  const [latestRun, profiles, gate] = await Promise.all([
    prisma.jobSearchRun.findFirst({ where: { status: "completed" }, orderBy: { startedAt: "desc" } }),
    prisma.jobSearchProfile.findMany({
      where: { userId },
      include: { performanceSnapshots: { orderBy: { lastEvaluatedAt: "desc" }, take: 1 } },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    }),
    searchOptimizationGate({ userId }),
  ]);
  const analytics = latestRun ? buildSearchRunAnalytics(latestRun) : null;
  return {
    latestRun: latestRun && analytics ? {
      id: latestRun.id,
      startedAt: latestRun.startedAt.toISOString(),
      jobsFetched: analytics.stats.jobsFetched,
      jobsAfterFilters: analytics.stats.jobsAfterFilters,
      jobsSaved: analytics.stats.jobsSaved,
      analytics,
    } : null,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      minimumMatchScore: profile.minimumMatchScore,
      maxResultsPerRun: profile.maxResultsPerRun,
      keywordsPreferred: profile.keywordsPreferred,
      keywordsExcluded: profile.keywordsExcluded,
      excludedTitles: profile.excludedTitles,
      preferredCompanies: profile.preferredCompanies,
      latestPerformance: profile.performanceSnapshots[0] ? {
        healthScore: profile.performanceSnapshots[0].healthScore,
        jobsFound: profile.performanceSnapshots[0].jobsFound,
        jobsApproved: profile.performanceSnapshots[0].jobsApproved,
        jobsRejected: profile.performanceSnapshots[0].jobsRejected,
        applicationsSubmitted: profile.performanceSnapshots[0].applicationsSubmitted,
        callbackRate: profile.performanceSnapshots[0].callbackRate,
        duplicateRate: profile.performanceSnapshots[0].duplicateRate,
      } : null,
    })),
    gate,
  };
}

export async function searchOptimizationGate({ userId }: { userId: string }): Promise<SearchOptimizationGate> {
  const [runningSearch, failedRuns] = await Promise.all([
    prisma.jobSearchRun.findFirst({ where: { status: "running" }, select: { id: true } }),
    prisma.agentRun.count({
      where: {
        userId,
        agentType: { in: ["RECRUITING_SEARCH_DIRECTOR", "SEARCH_PROFILE_EDITOR", "SEARCH_YIELD_ANALYST"] },
        status: "FAILED",
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  const reasons: string[] = [];
  if (runningSearch) reasons.push("A search run is currently active; profile edits wait until the run is stable.");
  if (failedRuns > 0) reasons.push(`${failedRuns} recent recruiting search team failure(s) need review.`);
  return { canAutoApply: reasons.length === 0, reasons };
}

export async function applySearchProfileChange(changeId: string) {
  const change = await prisma.searchProfileChange.findUnique({
    where: { id: changeId },
    include: { searchProfile: true },
  });
  if (!change) throw new Error("Search profile change not found.");
  if (change.status === "APPLIED") return change;
  if (change.riskLevel !== "LOW") throw new Error("Only low-risk search profile changes can be applied automatically.");

  const update = updateForChange(change);
  const applied = await prisma.$transaction(async (tx) => {
    await tx.jobSearchProfile.update({ where: { id: change.searchProfileId }, data: update });
    return tx.searchProfileChange.update({
      where: { id: change.id },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
  });
  return applied;
}

export async function rollbackSearchProfileChange(changeId: string) {
  const change = await prisma.searchProfileChange.findUnique({
    where: { id: changeId },
    include: { searchProfile: true },
  });
  if (!change) throw new Error("Search profile change not found.");
  if (change.status !== "APPLIED") throw new Error("Only applied search profile changes can be rolled back.");

  const rollback = rollbackForChange(change);
  return prisma.$transaction(async (tx) => {
    await tx.jobSearchProfile.update({ where: { id: change.searchProfileId }, data: rollback });
    return tx.searchProfileChange.update({
      where: { id: change.id },
      data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
    });
  });
}

export function recommendSearchProfileChanges(context: SearchOptimizationContext): CandidateChange[] {
  if (!context.latestRun || context.latestRun.analytics.stats.jobsFetched < 25) return [];
  const analytics = context.latestRun.analytics;
  const activeProfiles = context.profiles.filter((profile) => profile.enabled);
  const changes: CandidateChange[] = [];
  const weakestProfile = weakestEnabledProfile(context);
  if (!weakestProfile) return changes;

  const qualified = qualifiedYield(context);
  const topBlocker = analytics.topBlocker?.label ?? "";
  const scoreBuckets = analytics.stats.scoreBuckets ?? {};
  const nearMiss = Number(scoreBuckets.nearMiss ?? 0);
  const qualifiedBucket = Number(scoreBuckets.qualified ?? 0) + Number(scoreBuckets.highConfidence ?? 0);

  if (qualified < 3 && /below threshold/i.test(topBlocker)) {
    changes.push(addListValues({
      profile: weakestProfile,
      action: "ADD_EXCLUDED_KEYWORDS",
      fieldName: "keywordsExcluded",
      currentValues: jsonArray(weakestProfile.keywordsExcluded),
      values: noisyKeywordExclusions(analytics),
      rationale: `Qualified yield is ${qualified}% and below-threshold jobs dominate. Excluding recurring low-fit terms should reduce noisy scored volume.`,
      expected: { targetMetric: "QUALIFIED_YIELD", direction: "increase", reason: "Reduce low-fit fetched/scored volume before scoring." },
      autoApply: true,
    }));
  }

  if (nearMiss > Math.max(10, qualifiedBucket * 2) && weakestProfile.minimumMatchScore >= 72) {
    changes.push(setNumberValue({
      profile: weakestProfile,
      action: "SET_MINIMUM_MATCH_SCORE",
      fieldName: "minimumMatchScore",
      currentValue: weakestProfile.minimumMatchScore,
      nextValue: Math.max(70, weakestProfile.minimumMatchScore - 3),
      rationale: `${nearMiss} near-miss job(s) are just below threshold. A small threshold decrease can expose reviewable matches without opening the floodgates.`,
      expected: { targetMetric: "QUALIFIED_YIELD", direction: "increase", reason: "Convert near misses into qualified jobs for review." },
      autoApply: true,
    }));
  }

  const topSourceShare = topSourceFetchedShare(analytics);
  if (topSourceShare >= 70 && weakestProfile.maxResultsPerRun > 25) {
    changes.push(setNumberValue({
      profile: weakestProfile,
      action: "SET_MAX_RESULTS",
      fieldName: "maxResultsPerRun",
      currentValue: weakestProfile.maxResultsPerRun,
      nextValue: Math.max(25, Math.round(weakestProfile.maxResultsPerRun * 0.75)),
      rationale: `One source/profile path dominates fetched volume at ${topSourceShare}%. Capping the weakest profile should improve source balance and reduce noise.`,
      expected: { targetMetric: "QUALIFIED_YIELD", direction: "increase", reason: "Reduce overrepresented low-yield volume." },
      autoApply: true,
    }));
  }

  for (const profile of activeProfiles) {
    const performance = profile.latestPerformance;
    if (performance && performance.jobsFound >= 80 && performance.healthScore < 35 && performance.callbackRate === 0) {
      changes.push(setBooleanValue({
        profile,
        action: "PAUSE_PROFILE",
        fieldName: "enabled",
        currentValue: profile.enabled,
        nextValue: false,
        rationale: `${profile.name} has ${performance.jobsFound} historical matches, health ${performance.healthScore}, and no callback signal. Pause it before the next scheduled search.`,
        expected: { targetMetric: "QUALIFIED_YIELD", direction: "increase", reason: "Stop repeatedly low-yield campaigns from dominating future runs." },
        autoApply: true,
      }));
    } else if (performance && performance.jobsFound >= 40 && performance.healthScore < 50) {
      changes.push({
        ...setBooleanValue({
          profile,
          action: "PAUSE_PROFILE",
          fieldName: "enabled",
          currentValue: profile.enabled,
          nextValue: false,
          rationale: `${profile.name} has weak health but not enough negative outcome proof for automatic pause. Review before disabling.`,
          expected: { targetMetric: "QUALIFIED_YIELD", direction: "increase", reason: "Potentially stop low-yield campaign noise." },
          autoApply: false,
        }),
        riskLevel: "HIGH",
      });
    }
  }

  return dedupeChanges(changes).slice(0, 8);
}

async function runSpecialists(input: { userId: string; parentRunId: string; context: SearchOptimizationContext }) {
  const roles = [
    ["SEARCH_YIELD_ANALYST", "Diagnosed Qualified yield, score buckets, and top blockers."],
    ["SOURCE_QUALITY_ANALYST", "Reviewed source mix and source/profile concentration."],
    ["MATCH_CALIBRATION_REVIEWER", "Reviewed near-miss and threshold calibration risk."],
    ["OUTCOME_RECRUITER", "Reviewed callbacks and profile health before profile edits."],
    ["SEARCH_PROFILE_EDITOR", "Prepared bounded local profile edits and review-only changes."],
  ] as const;
  const runs = [];
  for (const [agentType, summary] of roles) {
    const result = await runAgent({
      agentType,
      input: { optimizationParentRunId: input.parentRunId, targetMetric: "QUALIFIED_YIELD" },
      userId: input.userId,
      parentRunId: input.parentRunId,
      execute: async () => ({
        summary,
        latestRunId: input.context.latestRun?.id ?? null,
        qualifiedYield: qualifiedYield(input.context),
        gate: input.context.gate,
      }),
    });
    runs.push({ role: agentType, runId: result.run.id, status: result.run.status, summary });
  }
  return runs;
}

function updateForChange(change: SearchProfileChange & { searchProfile: JobSearchProfile }): Prisma.JobSearchProfileUpdateInput {
  const after = objectValue(change.afterJson);
  if (change.action === "ADD_EXCLUDED_KEYWORDS") return { keywordsExcluded: stringArray(after.values) as Prisma.InputJsonValue };
  if (change.action === "ADD_EXCLUDED_TITLES") return { excludedTitles: stringArray(after.values) as Prisma.InputJsonValue };
  if (change.action === "ADD_PREFERRED_KEYWORDS") return { keywordsPreferred: stringArray(after.values) as Prisma.InputJsonValue };
  if (change.action === "ADD_PREFERRED_COMPANIES") return { preferredCompanies: stringArray(after.values) as Prisma.InputJsonValue };
  if (change.action === "SET_MAX_RESULTS") return { maxResultsPerRun: numericValue(after.value, change.searchProfile.maxResultsPerRun) };
  if (change.action === "SET_MINIMUM_MATCH_SCORE") return { minimumMatchScore: numericValue(after.value, change.searchProfile.minimumMatchScore) };
  if (change.action === "PAUSE_PROFILE") return { enabled: Boolean(after.value) };
  throw new Error(`Unsupported search profile change action: ${change.action}`);
}

function rollbackForChange(change: SearchProfileChange & { searchProfile: JobSearchProfile }): Prisma.JobSearchProfileUpdateInput {
  const rollback = objectValue(change.rollbackJson);
  if (change.action === "ADD_EXCLUDED_KEYWORDS") return { keywordsExcluded: stringArray(rollback.previousValue) as Prisma.InputJsonValue };
  if (change.action === "ADD_EXCLUDED_TITLES") return { excludedTitles: stringArray(rollback.previousValue) as Prisma.InputJsonValue };
  if (change.action === "ADD_PREFERRED_KEYWORDS") return { keywordsPreferred: stringArray(rollback.previousValue) as Prisma.InputJsonValue };
  if (change.action === "ADD_PREFERRED_COMPANIES") return { preferredCompanies: stringArray(rollback.previousValue) as Prisma.InputJsonValue };
  if (change.action === "SET_MAX_RESULTS") return { maxResultsPerRun: numericValue(rollback.previousValue, change.searchProfile.maxResultsPerRun) };
  if (change.action === "SET_MINIMUM_MATCH_SCORE") return { minimumMatchScore: numericValue(rollback.previousValue, change.searchProfile.minimumMatchScore) };
  if (change.action === "PAUSE_PROFILE") return { enabled: Boolean(rollback.previousValue) };
  throw new Error(`Unsupported rollback action: ${change.action}`);
}

function weakestEnabledProfile(context: SearchOptimizationContext) {
  const byName = new Map(context.profiles.map((profile) => [profile.name, profile]));
  const weakFromAnalytics = context.latestRun?.analytics.profileYield
    .filter((item) => item.qualified > 0)
    .sort((left, right) => left.yieldRate - right.yieldRate || right.qualified - left.qualified)[0];
  return (weakFromAnalytics ? byName.get(weakFromAnalytics.label) : null)
    ?? context.profiles.filter((profile) => profile.enabled).sort((left, right) =>
      (left.latestPerformance?.healthScore ?? 100) - (right.latestPerformance?.healthScore ?? 100)
      || right.maxResultsPerRun - left.maxResultsPerRun,
    )[0]
    ?? null;
}

function qualifiedYield(context: SearchOptimizationContext) {
  const stats = context.latestRun?.analytics.stats;
  if (!stats) return 0;
  const scored = stats.jobsScored ?? stats.detailCandidates ?? stats.jobsFetched;
  return scored ? Math.round((stats.jobsAfterFilters / scored) * 1000) / 10 : 0;
}

function topSourceFetchedShare(analytics: SearchRunAnalytics) {
  const top = analytics.sourceYield[0]?.fetched ?? 0;
  return analytics.stats.jobsFetched ? Math.round((top / analytics.stats.jobsFetched) * 100) : 0;
}

function noisyKeywordExclusions(analytics: SearchRunAnalytics) {
  const values = ["intern", "new grad", "android", "ios"];
  if ((analytics.stats.backendDataPlatformTitles ?? 0) > 0) values.push("data platform only");
  if ((analytics.stats.genericSoftwareTitles ?? 0) > 0) values.push("generic software");
  if ((analytics.stats.nonTargetTitles ?? 0) > 0) values.push("non product engineering");
  return values;
}

function addListValues(input: {
  profile: SearchOptimizationProfile;
  action: Extract<SearchProfileChangeAction, "ADD_EXCLUDED_KEYWORDS" | "ADD_EXCLUDED_TITLES" | "ADD_PREFERRED_KEYWORDS" | "ADD_PREFERRED_COMPANIES">;
  fieldName: string;
  currentValues: string[];
  values: string[];
  rationale: string;
  expected: Record<string, unknown>;
  autoApply: boolean;
}): CandidateChange {
  const nextValues = unique([...input.currentValues, ...input.values]).slice(0, 30);
  return {
    profileName: input.profile.name,
    searchProfileId: input.profile.id,
    action: input.action,
    riskLevel: "LOW",
    fieldName: input.fieldName,
    beforeJson: { values: input.currentValues },
    afterJson: { values: nextValues },
    rollbackJson: { field: input.fieldName, previousValue: input.currentValues },
    rationale: input.rationale,
    expectedMetricsJson: input.expected as Prisma.InputJsonValue,
    autoApply: input.autoApply && nextValues.length > input.currentValues.length,
  };
}

function setNumberValue(input: {
  profile: SearchOptimizationProfile;
  action: Extract<SearchProfileChangeAction, "SET_MAX_RESULTS" | "SET_MINIMUM_MATCH_SCORE">;
  fieldName: string;
  currentValue: number;
  nextValue: number;
  rationale: string;
  expected: Record<string, unknown>;
  autoApply: boolean;
}): CandidateChange {
  return scalarChange({ ...input, riskLevel: "LOW" });
}

function setBooleanValue(input: {
  profile: SearchOptimizationProfile;
  action: Extract<SearchProfileChangeAction, "PAUSE_PROFILE">;
  fieldName: string;
  currentValue: boolean;
  nextValue: boolean;
  rationale: string;
  expected: Record<string, unknown>;
  autoApply: boolean;
}): CandidateChange {
  return scalarChange({ ...input, riskLevel: "LOW" });
}

function scalarChange(input: {
  profile: SearchOptimizationProfile;
  action: SearchProfileChangeAction;
  fieldName: string;
  currentValue: number | boolean;
  nextValue: number | boolean;
  rationale: string;
  expected: Record<string, unknown>;
  autoApply: boolean;
  riskLevel: "LOW" | "HIGH";
}): CandidateChange {
  return {
    profileName: input.profile.name,
    searchProfileId: input.profile.id,
    action: input.action,
    riskLevel: input.riskLevel,
    fieldName: input.fieldName,
    beforeJson: { value: input.currentValue },
    afterJson: { value: input.nextValue },
    rollbackJson: { field: input.fieldName, previousValue: input.currentValue },
    rationale: input.rationale,
    expectedMetricsJson: input.expected as Prisma.InputJsonValue,
    autoApply: input.autoApply && input.currentValue !== input.nextValue,
  };
}

function dedupeChanges(changes: CandidateChange[]) {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = `${change.searchProfileId}:${change.action}:${change.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return change.autoApply || change.riskLevel === "HIGH";
  });
}

function summarizeOptimization(context: SearchOptimizationContext, changes: CandidateChange[]) {
  if (!context.latestRun) return "No completed search run is available yet. Run discovery before the recruiting search team can optimize profiles.";
  const qualified = qualifiedYield(context);
  const topBlocker = context.latestRun.analytics.topBlocker?.label ?? "no dominant blocker";
  return `Qualified yield is ${qualified}% with ${topBlocker.toLowerCase()} as the leading blocker. Recruiting search team prepared ${changes.length} profile change(s) to improve search precision.`;
}

function metricsJson(context: SearchOptimizationContext) {
  const analytics = context.latestRun?.analytics;
  return {
    latestRunId: context.latestRun?.id ?? null,
    qualifiedYield: qualifiedYield(context),
    jobsFetched: analytics?.stats.jobsFetched ?? 0,
    jobsAfterFilters: analytics?.stats.jobsAfterFilters ?? 0,
    jobsSaved: analytics?.stats.jobsSaved ?? 0,
    topBlocker: analytics?.topBlocker ?? null,
    runQuality: analytics?.runQuality ?? null,
  };
}

function candidateSummary(candidate: CandidateChange) {
  return {
    profileId: candidate.searchProfileId,
    profileName: candidate.profileName,
    action: candidate.action,
    riskLevel: candidate.riskLevel,
    autoApply: candidate.autoApply,
    rationale: candidate.rationale,
  };
}

function nextActions(context: SearchOptimizationContext, changes: Array<SearchProfileChange & { searchProfile: { name: string } }>) {
  const actions: string[] = [];
  const applied = changes.filter((change) => change.status === "APPLIED").length;
  const reviewOnly = changes.filter((change) => change.status === "REVIEW_ONLY").length;
  const highRiskReview = changes.filter((change) => change.status === "REVIEW_ONLY" && change.riskLevel === "HIGH").length;
  if (applied) actions.push(`Run the next search and compare Qualified yield against ${qualifiedYield(context)}%.`);
  if (highRiskReview) actions.push(`Review ${highRiskReview} high-risk profile change(s) before applying structural search edits.`);
  else if (reviewOnly) actions.push(`Review ${reviewOnly} proposed profile change(s) before applying search edits.`);
  if (!changes.length) actions.push("Run another search after profile/source changes produce enough data for diagnosis.");
  return actions;
}

function objectValue(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numericValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
