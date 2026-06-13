import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLinkedInContentMemoryPack } from "@/lib/agents/linkedin-content-memory";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobSearchRun: { findFirst: vi.fn(), findMany: vi.fn() },
    agentRun: { findMany: vi.fn() },
    application: { groupBy: vi.fn() },
    applicationOutcome: { groupBy: vi.fn() },
    skillAdjustment: { findMany: vi.fn() },
    linkedInPostDraft: { findMany: vi.fn() },
  },
}));

const jobSearchFindFirstMock = vi.mocked(prisma.jobSearchRun.findFirst);
const jobSearchFindManyMock = vi.mocked(prisma.jobSearchRun.findMany);
const agentRunFindManyMock = vi.mocked(prisma.agentRun.findMany);
const applicationGroupByMock = vi.mocked(prisma.application.groupBy);
const outcomeGroupByMock = vi.mocked(prisma.applicationOutcome.groupBy);
const skillAdjustmentFindManyMock = vi.mocked(prisma.skillAdjustment.findMany);
const draftFindManyMock = vi.mocked(prisma.linkedInPostDraft.findMany);

describe("LinkedIn content memory pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const run = {
      id: "run_1",
      status: "completed",
      jobsFetched: 100,
      jobsAfterDedupe: 60,
      jobsAfterFilters: 20,
      jobsSaved: 12,
      progress: [{ stats: { jobsScored: 90, jobsBelowThreshold: 70, agencyEligible: 8 } }],
      createdAt: new Date("2026-06-13T10:00:00Z"),
    };
    jobSearchFindFirstMock.mockResolvedValue(run as never);
    jobSearchFindManyMock.mockResolvedValue([run] as never);
    agentRunFindManyMock.mockResolvedValue([{ id: "agent_1", agentType: "MARKET_INTELLIGENCE", outputJson: {}, createdAt: new Date("2026-06-13T10:00:00Z") }] as never);
    applicationGroupByMock.mockResolvedValue([{ status: "applied", _count: { _all: 3 } }] as never);
    outcomeGroupByMock.mockResolvedValue([{ outcome: "INTERVIEW", _count: { _all: 1 } }] as never);
    skillAdjustmentFindManyMock.mockResolvedValue([{ id: "adjust_1", skillId: "job_fit_scorer", rationale: "Be stricter." }] as never);
    draftFindManyMock.mockResolvedValue([{ id: "draft_1", title: "Old draft", status: "ARCHIVED", updatedAt: new Date(), publishError: null }] as never);
  });

  it("builds aggregate analytics without private details", async () => {
    const pack = await buildLinkedInContentMemoryPack("user_1");

    expect(pack.aggregateFacts.join(" ")).toContain("Fetched 100");
    expect(pack.aggregateFacts.join(" ")).toContain("applied 3");
    expect(pack.publicPolicy).toContain("Aggregate analytics only");
    expect(pack.doNotClaim.join(" ")).toContain("Do not name companies");
    expect(pack.analyticsSources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "search_run", ref: "run_1" })]));
  });
});
