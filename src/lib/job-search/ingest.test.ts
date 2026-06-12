import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { autoRunAgencyAfterSearch } from "@/lib/job-search/ingest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/applications/recruiting-agency", () => ({
  runRecruitingAgency: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRun: { findFirst: vi.fn() },
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

const runAgencyMock = vi.mocked(runRecruitingAgency);
const agentRunFindFirstMock = vi.mocked(prisma.agentRun.findFirst);
const matchCountMock = vi.mocked(prisma.jobProfileMatch.count);
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

function stats(input: Partial<{ jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number }> = {}) {
  return {
    jobsFetched: input.jobsFetched ?? 20,
    jobsAfterDedupe: input.jobsAfterDedupe ?? 8,
    jobsAfterFilters: input.jobsAfterFilters ?? 4,
    jobsSaved: input.jobsSaved ?? 3,
  };
}
