import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/agents/market-intelligence", () => ({
  runMarketIntelligenceAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const runMarketMock = vi.mocked(runMarketIntelligenceAgent);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/market-intelligence/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    runMarketMock.mockResolvedValue({
      output: {
        generatedAt: "2026-06-12T00:00:00.000Z",
        lookbackDays: 45,
        summary: "Market brief",
        marketTemperature: [],
        skillSignals: [],
        recommendedActions: [],
        sourceDigest: [],
        researchDigest: [],
        researchSynthesis: { mode: "deterministic", narrative: "", appObservedFacts: [], sourceBackedClaims: [], inferredRecommendations: [], contradictions: [], opportunities: [], risks: [], warnings: [] },
        chartData: { laneDemand: [], skillDemand: [], profileHealth: [], actionMix: [], matchQualityDistribution: [], sourceCoverage: [] },
        dataFreshness: { internalJobsAnalyzed: 0, applicationsAnalyzed: 0, profilesAnalyzed: 0, externalSourcesChecked: 0 },
        confidence: 0.5,
        searchAdaptations: [{ action: "add_preferred_keywords", riskLevel: "LOW", values: ["AI"], rationale: "Demand", confidence: 0.8, autoApply: true, status: "applied" }],
        adaptationSummary: { applied: 1, reviewOnly: 0, skipped: 0 },
      },
    } as never);
  });

  it("returns market adaptation metadata from the manual run", async () => {
    const response = await POST(new Request("http://localhost/api/market-intelligence/run", { method: "POST" }));
    const payload = await response.json();

    expect(runMarketMock).toHaveBeenCalledWith({ userId: "user_1", lookbackDays: undefined, researchDepth: undefined });
    expect(payload).toMatchObject({
      message: "Market intelligence brief generated.",
      adaptationSummary: { applied: 1, reviewOnly: 0, skipped: 0 },
      searchAdaptations: [expect.objectContaining({ status: "applied", values: ["AI"] })],
    });
  });
});
