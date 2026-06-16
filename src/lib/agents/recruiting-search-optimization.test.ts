import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySearchProfileChange,
  recommendSearchProfileChanges,
  rollbackSearchProfileChange,
  runRecruitingSearchOptimization,
  type SearchOptimizationContext,
} from "@/lib/agents/recruiting-search-optimization";
import { buildSearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/agents/run-agent", () => ({
  runAgent: vi.fn(async ({ agentType, execute }: any) => {
    const run = { id: `run_${agentType}`, agentType, status: "COMPLETED" };
    const output = await execute(run);
    return { run, output };
  }),
}));

const state = vi.hoisted(() => ({
  latestSearchRun: null as any,
  profiles: [] as any[],
  changes: [] as any[],
  runningSearch: null as any,
  failedRuns: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobSearchRun: { findFirst: vi.fn((input: any) => input?.where?.status === "running" ? Promise.resolve(state.runningSearch) : Promise.resolve(state.latestSearchRun)) },
    jobSearchProfile: {
      findMany: vi.fn(() => Promise.resolve(state.profiles)),
      update: vi.fn((input: any) => Promise.resolve({ id: input.where.id, ...input.data })),
    },
    agentRun: { count: vi.fn(() => Promise.resolve(state.failedRuns)) },
    agentRunEvent: { create: vi.fn(() => Promise.resolve({ id: "event_1" })) },
    searchOptimizationRun: { create: vi.fn(() => Promise.resolve({ id: "optimization_1" })) },
    searchProfileChange: {
      create: vi.fn((input: any) => {
        const change = { id: `change_${state.changes.length + 1}`, ...input.data, searchProfile: { name: "AI Product" } };
        state.changes.push(change);
        return Promise.resolve(change);
      }),
      findMany: vi.fn(() => Promise.resolve(state.changes.map((change) => ({ ...change, searchProfile: { name: "AI Product" } })))),
      findUnique: vi.fn((input: any) => Promise.resolve(state.changes.find((change) => change.id === input.where.id) ?? null)),
      update: vi.fn((input: any) => {
        const existing = state.changes.find((change) => change.id === input.where.id);
        Object.assign(existing, input.data);
        return Promise.resolve(existing);
      }),
    },
    $transaction: vi.fn((callback: any) => callback(prisma)),
  },
}));

describe("recruiting search optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.latestSearchRun = searchRun();
    state.profiles = [profile()];
    state.changes = [];
    state.runningSearch = null;
    state.failedRuns = 0;
  });

  it("recommends bounded profile edits when qualified yield is weak", () => {
    const changes = recommendSearchProfileChanges(context());

    expect(changes.map((change) => change.action)).toEqual(expect.arrayContaining([
      "ADD_EXCLUDED_KEYWORDS",
      "SET_MINIMUM_MATCH_SCORE",
      "SET_MAX_RESULTS",
    ]));
    expect(changes.filter((change) => change.autoApply).every((change) => change.riskLevel === "LOW")).toBe(true);
    expect(changes.some((change) => change.riskLevel === "HIGH" && change.autoApply === false)).toBe(true);
  });

  it("runs the Jolene-orchestrated search team and applies low-risk changes", async () => {
    const result = await runRecruitingSearchOptimization({ userId: "user_1", mode: "active" });

    expect(result.output.specialists.map((item) => item.role)).toContain("SEARCH_YIELD_ANALYST");
    expect(prisma.searchOptimizationRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentRunId: "run_RECRUITING_SEARCH_DIRECTOR", targetMetric: "QUALIFIED_YIELD" }),
    }));
    expect(prisma.jobSearchProfile.update).toHaveBeenCalled();
    expect(result.output.changes.some((change) => change.status === "APPLIED")).toBe(true);
  });

  it("does not auto-apply while the optimization gate is closed", async () => {
    state.runningSearch = { id: "search_running" };

    const result = await runRecruitingSearchOptimization({ userId: "user_1", mode: "active" });

    expect(prisma.jobSearchProfile.update).not.toHaveBeenCalled();
    expect(result.output.gate.canAutoApply).toBe(false);
    expect(result.output.changes.every((change) => change.status === "REVIEW_ONLY")).toBe(true);
  });

  it("rolls back an applied keyword change", async () => {
    state.changes = [{
      id: "change_1",
      status: "APPLIED",
      riskLevel: "LOW",
      action: "ADD_EXCLUDED_KEYWORDS",
      searchProfileId: "profile_1",
      searchProfile: profile(),
      afterJson: { values: ["intern", "ios"] },
      rollbackJson: { field: "keywordsExcluded", previousValue: ["legacy"] },
    }];

    const rolledBack = await rollbackSearchProfileChange("change_1");

    expect(prisma.jobSearchProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: { keywordsExcluded: ["legacy"] },
    });
    expect(rolledBack.status).toBe("ROLLED_BACK");
  });

  it("blocks high-risk apply attempts", async () => {
    state.changes = [{
      id: "change_high",
      status: "REVIEW_ONLY",
      riskLevel: "HIGH",
      action: "PAUSE_PROFILE",
      searchProfileId: "profile_1",
      searchProfile: profile(),
      afterJson: { value: false },
      rollbackJson: { previousValue: true },
    }];

    await expect(applySearchProfileChange("change_high")).rejects.toThrow("Only low-risk");
  });
});

function context(): SearchOptimizationContext {
  return {
    latestRun: {
      id: "search_1",
      startedAt: new Date().toISOString(),
      jobsFetched: 1000,
      jobsAfterFilters: 12,
      jobsSaved: 4,
      analytics: searchRun().analytics,
    },
    profiles: [{
      id: "profile_1",
      name: "AI Product",
      enabled: true,
      minimumMatchScore: 76,
      maxResultsPerRun: 80,
      keywordsPreferred: [],
      keywordsExcluded: [],
      excludedTitles: [],
      preferredCompanies: [],
      latestPerformance: { healthScore: 44, jobsFound: 55, jobsApproved: 3, jobsRejected: 20, applicationsSubmitted: 2, callbackRate: 0, duplicateRate: 12 },
    }],
    gate: { canAutoApply: true, reasons: [] },
  };
}

function searchRun() {
  const progress = [{
    stats: {
      jobsFetched: 1000,
      detailCandidates: 900,
      jobsScored: 900,
      jobsAfterFilters: 12,
      jobsAfterDedupe: 10,
      jobsSaved: 4,
      jobsBelowThreshold: 888,
      backendDataPlatformTitles: 8,
      genericSoftwareTitles: 6,
      scoreBuckets: { below: 800, nearMiss: 80, qualified: 8, highConfidence: 4 },
      byProfile: { "AI Product": { fetched: 800, scored: 760, qualified: 10, saved: 3 } },
      bySource: { "Search Query Backlog": { fetched: 800, scored: 760, qualified: 10, saved: 3 } },
    },
  }];
  return {
    id: "search_1",
    startedAt: new Date(),
    finishedAt: new Date(),
    status: "completed",
    triggeredBy: "manual",
    jobsFetched: 1000,
    jobsAfterDedupe: 10,
    jobsAfterFilters: 12,
    jobsSaved: 4,
    progress,
    errors: [],
    createdAt: new Date(),
    analytics: buildSearchRunAnalytics({ jobsFetched: 1000, jobsAfterDedupe: 10, jobsAfterFilters: 12, jobsSaved: 4, progress }),
  };
}

function profile() {
  return {
    id: "profile_1",
    name: "AI Product",
    enabled: true,
    minimumMatchScore: 76,
    maxResultsPerRun: 80,
    keywordsPreferred: [],
    keywordsExcluded: [],
    excludedTitles: [],
    preferredCompanies: [],
    performanceSnapshots: [{ healthScore: 44, jobsFound: 55, jobsApproved: 3, jobsRejected: 20, applicationsSubmitted: 2, callbackRate: 0, duplicateRate: 12 }],
  };
}
