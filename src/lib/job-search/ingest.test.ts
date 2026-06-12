import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { runSearchProfileManagerAgent } from "@/lib/agents/search-profile-manager";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { autoRunAgencyAfterSearch, autoRunMarketIntelligenceAfterSearch, autoRunProfileOptimizerAfterSearch } from "@/lib/job-search/ingest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/applications/recruiting-agency", () => ({
  runRecruitingAgency: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRun: { findFirst: vi.fn() },
    application: { count: vi.fn() },
    jobProfileMatch: { count: vi.fn() },
    jobSearchRun: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/agents/duplicate-stale-job-detector", () => ({
  runDuplicateStaleJobDetectorAgent: vi.fn(),
}));

vi.mock("@/lib/agents/job-fit-scorer", () => ({
  runJobFitScoringAgent: vi.fn(),
}));

vi.mock("@/lib/agents/market-intelligence", () => ({
  runMarketIntelligenceAgent: vi.fn(),
}));

vi.mock("@/lib/agents/search-profile-manager", () => ({
  runSearchProfileManagerAgent: vi.fn(),
}));

const runAgencyMock = vi.mocked(runRecruitingAgency);
const runMarketIntelligenceMock = vi.mocked(runMarketIntelligenceAgent);
const runSearchProfileManagerMock = vi.mocked(runSearchProfileManagerAgent);
const agentRunFindFirstMock = vi.mocked(prisma.agentRun.findFirst);
const matchCountMock = vi.mocked(prisma.jobProfileMatch.count);
const applicationCountMock = vi.mocked(prisma.application.count);
const searchRunFindUniqueMock = vi.mocked(prisma.jobSearchRun.findUnique);
const searchRunUpdateMock = vi.mocked(prisma.jobSearchRun.update);

describe("autoRunAgencyAfterSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentRunFindFirstMock.mockResolvedValue(null);
    matchCountMock.mockResolvedValue(3);
    searchRunFindUniqueMock.mockResolvedValue({ progress: [] } as never);
    searchRunUpdateMock.mockResolvedValue({ id: "search_1" } as never);
    runAgencyMock.mockImplementation(async (input = {}) => {
      await input.onStarted?.("agency_1");
      return {
      agentRunId: "agency_1",
      requested: { minimumScore: 0, limit: 3, triggeredBy: "search_auto" },
      approved: 2,
      prepared: 2,
      failed: 0,
      skipped: 1,
      results: [],
      message: "Recruiting agency prepared 2 application packages from 2 approved matches. 0 failed.",
      };
    });
  });

  it("starts the recruiting agency after a successful search with every eligible saved match", async () => {
    const result = await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 3,
      stats: stats(),
    });

    expect(matchCountMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "needs_review",
        jobSearchProfile: { userId: "user_1" },
        NOT: {
          recommendedAction: {
            startsWith: "Review-only broad discovery",
          },
        },
      }),
    }));
    expect(runAgencyMock).toHaveBeenCalledWith(expect.objectContaining({ minimumScore: 0, limit: 3, triggeredBy: "search_auto" }));
    expect(result).toMatchObject({ started: true, agentRunId: "agency_1" });
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("completed"),
            agencyHandoff: expect.objectContaining({
              status: "completed",
              reason: "started",
              agentRunId: "agency_1",
              result: expect.objectContaining({ approved: 2, prepared: 2, failed: 0, skipped: 1 }),
            }),
          }),
        ]),
      }),
    }));
  });

  it("does not require a 90+ score gate for search auto handoff", async () => {
    matchCountMock.mockResolvedValue(1);

    await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 1,
      stats: stats({ jobsSaved: 1 }),
    });

    expect(matchCountMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ overallScore: { gte: 90 } }),
    }));
    expect(runAgencyMock).toHaveBeenCalledWith(expect.objectContaining({ minimumScore: 0, limit: 1, triggeredBy: "search_auto" }));
  });

  it("excludes review-only broad discovery matches from automatic agency handoff", async () => {
    await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 3,
      stats: stats(),
    });

    expect(matchCountMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        NOT: {
          recommendedAction: {
            startsWith: "Review-only broad discovery",
          },
        },
      }),
    }));
  });

  it("skips the agency when no jobs were saved and no existing eligible matches remain", async () => {
    matchCountMock.mockResolvedValue(0);

    const result = await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 0,
      stats: stats({ jobsSaved: 0 }),
    });

    expect(result).toMatchObject({ started: false, reason: "no_eligible_matches" });
    expect(runAgencyMock).not.toHaveBeenCalled();
    expect(matchCountMock).toHaveBeenCalled();
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            agencyHandoff: expect.objectContaining({ status: "skipped", reason: "no_eligible_matches" }),
          }),
        ]),
      }),
    }));
  });

  it("starts the agency for existing eligible matches even when the search saved no new matches", async () => {
    const result = await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 0,
      stats: stats({ jobsSaved: 0 }),
    });

    expect(result).toMatchObject({ started: true, agentRunId: "agency_1" });
    expect(runAgencyMock).toHaveBeenCalledWith(expect.objectContaining({ minimumScore: 0, limit: 3, triggeredBy: "search_auto" }));
  });

  it("skips the agency while another agency run is active", async () => {
    agentRunFindFirstMock.mockResolvedValue({ id: "agency_active" } as never);

    const result = await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "partial",
      jobsSaved: 2,
      stats: stats(),
    });

    expect(result).toMatchObject({ started: false, reason: "agency_already_running", agentRunId: "agency_active" });
    expect(runAgencyMock).not.toHaveBeenCalled();
    expect(matchCountMock).not.toHaveBeenCalled();
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            agencyHandoff: expect.objectContaining({
              status: "running",
              reason: "agency_already_running",
              agentRunId: "agency_active",
            }),
          }),
        ]),
      }),
    }));
  });

  it("records failed handoff metadata when the agency throws", async () => {
    runAgencyMock.mockRejectedValue(new Error("packet generation failed"));

    const result = await autoRunAgencyAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      jobsSaved: 2,
      stats: stats(),
    });

    expect(result).toMatchObject({ started: false, reason: "agency_failed", error: "packet generation failed" });
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            agencyHandoff: expect.objectContaining({
              status: "failed",
              reason: "agency_failed",
              error: "packet generation failed",
            }),
          }),
        ]),
      }),
    }));
  });
});

describe("autoRunMarketIntelligenceAfterSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchRunFindUniqueMock.mockResolvedValue({ progress: [] } as never);
    searchRunUpdateMock.mockResolvedValue({ id: "search_1" } as never);
    runMarketIntelligenceMock.mockResolvedValue({
      run: { id: "market_1" },
      output: {
        marketTemperature: [{ lane: "AI product/frontend" }],
        recommendedActions: [{ title: "Tune profile" }, { title: "Prioritize AI product roles" }],
      },
    } as never);
  });

  it("runs market intelligence after a completed manual search", async () => {
    const result = await autoRunMarketIntelligenceAfterSearch({
      runId: "search_1",
      userId: "user_1",
      triggeredBy: "manual",
      status: "completed",
      stats: stats(),
      profileOptimizer: completedOptimizerProgress(),
    });

    expect(runMarketIntelligenceMock).toHaveBeenCalledWith({
      userId: "user_1",
      researchDepth: "standard",
      triggeredBy: "manual",
      jobSearchRunId: "search_1",
      source: "search_completion",
    });
    expect(result).toMatchObject({ started: true, agentRunId: "market_1" });
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Market intelligence completed"),
            marketIntelligence: expect.objectContaining({
              status: "completed",
              reason: "started",
              agentRunId: "market_1",
            }),
          }),
        ]),
      }),
    }));
  });

  it("runs market intelligence after a partial cron search", async () => {
    await autoRunMarketIntelligenceAfterSearch({
      runId: "search_1",
      userId: "user_1",
      triggeredBy: "cron",
      status: "partial",
      stats: stats(),
      profileOptimizer: completedOptimizerProgress(),
    });

    expect(runMarketIntelligenceMock).toHaveBeenCalledWith(expect.objectContaining({
      triggeredBy: "cron",
      jobSearchRunId: "search_1",
      source: "search_completion",
    }));
  });

  it("skips market intelligence after a failed search", async () => {
    const result = await autoRunMarketIntelligenceAfterSearch({
      runId: "search_1",
      userId: "user_1",
      triggeredBy: "manual",
      status: "failed",
      stats: stats(),
    });

    expect(result).toMatchObject({ started: false, reason: "search_not_successful" });
    expect(runMarketIntelligenceMock).not.toHaveBeenCalled();
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            marketIntelligence: expect.objectContaining({ status: "skipped", reason: "search_not_successful" }),
          }),
        ]),
      }),
    }));
  });

  it("records market intelligence failure without throwing", async () => {
    runMarketIntelligenceMock.mockRejectedValue(new Error("research source failed"));

    const result = await autoRunMarketIntelligenceAfterSearch({
      runId: "search_1",
      userId: "user_1",
      triggeredBy: "manual",
      status: "completed",
      stats: stats(),
      profileOptimizer: completedOptimizerProgress(),
    });

    expect(result).toMatchObject({ started: false, reason: "market_intelligence_failed", error: "research source failed" });
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Market intelligence failed"),
            marketIntelligence: expect.objectContaining({
              status: "failed",
              reason: "market_intelligence_failed",
              error: "research source failed",
            }),
          }),
        ]),
      }),
    }));
  });

  it("pauses market intelligence when the profile optimizer gate is still open", async () => {
    const result = await autoRunMarketIntelligenceAfterSearch({
      runId: "search_1",
      userId: "user_1",
      triggeredBy: "manual",
      status: "completed",
      stats: stats(),
      profileOptimizer: {
        status: "skipped",
        reason: "review_gate_open",
        gates: { needsReview: 2, pendingApplications: 0 },
      },
    });

    expect(result).toMatchObject({ started: false, reason: "profile_optimizer_not_completed" });
    expect(runMarketIntelligenceMock).not.toHaveBeenCalled();
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            marketIntelligence: expect.objectContaining({
              status: "skipped",
              reason: "profile_optimizer_not_completed",
            }),
          }),
        ]),
      }),
    }));
  });
});

describe("autoRunProfileOptimizerAfterSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchRunFindUniqueMock.mockResolvedValue({ progress: [] } as never);
    searchRunUpdateMock.mockResolvedValue({ id: "search_1" } as never);
    matchCountMock.mockResolvedValue(0);
    applicationCountMock.mockResolvedValue(0);
    runSearchProfileManagerMock.mockResolvedValue({
      run: { id: "optimizer_1" },
      output: {
        profileHealthScores: [{ profileId: "profile_1", name: "Frontend", healthScore: 72 }],
        recommendedChanges: [{ profileId: "profile_1", profileName: "Frontend", action: "keep", summary: "Keep running." }],
        profilesToCreate: [],
      },
    } as never);
  });

  it("runs profile optimizer after review and application gates are clear", async () => {
    const result = await autoRunProfileOptimizerAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      stats: stats(),
    });

    expect(runSearchProfileManagerMock).toHaveBeenCalledWith({ userId: "user_1" });
    expect(result).toMatchObject({
      started: true,
      agentRunId: "optimizer_1",
      progress: expect.objectContaining({
        status: "completed",
        result: expect.objectContaining({ healthScores: 1, recommendedChanges: 1 }),
      }),
    });
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            profileOptimizer: expect.objectContaining({
              status: "completed",
              reason: "started",
              agentRunId: "optimizer_1",
            }),
          }),
        ]),
      }),
    }));
  });

  it("pauses profile optimizer while jobs still need review", async () => {
    matchCountMock.mockResolvedValue(4);

    const result = await autoRunProfileOptimizerAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      stats: stats(),
    });

    expect(result).toMatchObject({ started: false, reason: "review_gate_open" });
    expect(runSearchProfileManagerMock).not.toHaveBeenCalled();
    expect(searchRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        progress: expect.arrayContaining([
          expect.objectContaining({
            profileOptimizer: expect.objectContaining({
              status: "skipped",
              reason: "review_gate_open",
              gates: { needsReview: 4, pendingApplications: 0 },
            }),
          }),
        ]),
      }),
    }));
  });

  it("pauses profile optimizer while applications still need Apply Sprint", async () => {
    applicationCountMock.mockResolvedValue(3);

    const result = await autoRunProfileOptimizerAfterSearch({
      runId: "search_1",
      userId: "user_1",
      status: "completed",
      stats: stats(),
    });

    expect(result).toMatchObject({ started: false, reason: "application_gate_open" });
    expect(runSearchProfileManagerMock).not.toHaveBeenCalled();
  });
});

function stats(input: Partial<{ jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number }> = {}) {
  return {
    jobsFetched: input.jobsFetched ?? 20,
    jobsAfterDedupe: input.jobsAfterDedupe ?? 8,
    jobsAfterFilters: input.jobsAfterFilters ?? 4,
    jobsSaved: input.jobsSaved ?? 3,
  };
}

function completedOptimizerProgress() {
  return {
    status: "completed" as const,
    reason: "started" as const,
    agentRunId: "optimizer_1",
    result: { healthScores: 1, recommendedChanges: 1, profilesToCreate: 0 },
    gates: { needsReview: 0, pendingApplications: 0 },
  };
}
