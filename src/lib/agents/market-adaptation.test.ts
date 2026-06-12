import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMarketSearchAdaptations, buildMarketSearchAdaptations } from "@/lib/agents/market-adaptation";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobSearchProfile: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    agentImprovementProposal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const profileFindManyMock = vi.mocked(prisma.jobSearchProfile.findMany);
const profileUpdateMock = vi.mocked(prisma.jobSearchProfile.update);
const proposalFindFirstMock = vi.mocked(prisma.agentImprovementProposal.findFirst);
const proposalCreateMock = vi.mocked(prisma.agentImprovementProposal.create);

describe("market search adaptation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileUpdateMock.mockResolvedValue({ id: "profile_1" } as never);
    proposalFindFirstMock.mockResolvedValue(null);
    proposalCreateMock.mockResolvedValue({ id: "proposal_1" } as never);
  });

  it("builds adaptation candidates from top lane, skills, and companies", () => {
    const adaptations = buildMarketSearchAdaptations(report(), [profile()]);

    expect(adaptations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "add_preferred_keywords",
        riskLevel: "LOW",
        autoApply: true,
        values: expect.arrayContaining(["AI", "React", "TypeScript"]),
      }),
      expect.objectContaining({
        action: "add_preferred_companies",
        riskLevel: "LOW",
        autoApply: true,
        values: expect.arrayContaining(["Built In", "Himalayas"]),
      }),
      expect.objectContaining({
        action: "strengthen_profile",
        autoApply: false,
        status: "review_only",
      }),
    ]));
  });

  it("appends only unique low-risk preferred keywords and companies", async () => {
    const result = await applyMarketSearchAdaptations({
      userId: "user_1",
      agentRunId: "market_1",
      report: report(),
      profiles: [profile({ keywordsPreferred: ["React"], preferredCompanies: ["Built In"] })],
    });

    expect(profileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        keywordsPreferred: expect.arrayContaining(["React", "AI", "TypeScript"]),
      }),
    }));
    expect(profileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        preferredCompanies: expect.arrayContaining(["Built In", "Himalayas", "G2i Inc."]),
      }),
    }));
    expect(result.adaptationSummary).toMatchObject({ applied: 2, reviewOnly: 1, skipped: 0 });
  });

  it("caps automatic additions per run", async () => {
    await applyMarketSearchAdaptations({
      userId: "user_1",
      agentRunId: "market_1",
      report: report({
        skills: ["AI", "React", "TypeScript", "Analytics", "RAG", "Agents", "Node.js"],
        companies: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      }),
      profiles: [profile()],
    });

    expect(profileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ keywordsPreferred: ["AI", "React", "TypeScript", "Analytics", "RAG"] }),
    }));
    expect(profileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ preferredCompanies: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] }),
    }));
  });

  it("keeps review-only adaptations out of direct profile updates and creates proposals", async () => {
    await applyMarketSearchAdaptations({
      userId: "user_1",
      agentRunId: "market_1",
      report: report(),
      profiles: [profile()],
    });

    expect(proposalCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target: "JOB_SEARCH",
        type: "SKILL",
        riskLevel: "LOW",
        patchJson: expect.objectContaining({ category: "market_search_adaptation", action: "strengthen_profile" }),
      }),
    }));
  });

  it("dedupes existing review proposals", async () => {
    proposalFindFirstMock.mockResolvedValue({ id: "proposal_existing" } as never);

    const result = await applyMarketSearchAdaptations({
      userId: "user_1",
      agentRunId: "market_1",
      report: report(),
      profiles: [profile()],
    });

    expect(proposalCreateMock).not.toHaveBeenCalled();
    expect(result.searchAdaptations.find((adaptation) => adaptation.status === "review_only")).toMatchObject({
      proposalId: "proposal_existing",
    });
  });

  it("returns a skipped audit result when guarded adaptation fails", async () => {
    profileUpdateMock.mockRejectedValue(new Error("database unavailable"));

    const result = await applyMarketSearchAdaptations({
      userId: "user_1",
      agentRunId: "market_1",
      report: report(),
      profiles: [profile()],
    });

    expect(result.searchAdaptations[0]).toMatchObject({
      status: "failed",
      reason: "database unavailable",
    });
    expect(result.adaptationSummary.skipped).toBe(1);
  });
});

function profile(input: { keywordsPreferred?: string[]; preferredCompanies?: string[] } = {}) {
  return {
    id: "profile_1",
    name: "Enterprise SaaS Product UI",
    enabled: true,
    titles: ["Frontend Engineer"],
    keywordsPreferred: input.keywordsPreferred ?? [],
    preferredCompanies: input.preferredCompanies ?? [],
    performanceSnapshots: [{ healthScore: 72 }],
  } as any;
}

function report(input: { skills?: string[]; companies?: string[] } = {}): MarketIntelligenceOutput {
  const skills = input.skills ?? ["AI", "React", "TypeScript"];
  const companies = input.companies ?? ["Built In", "Himalayas", "G2i Inc."];
  return {
    generatedAt: "2026-06-12T00:00:00.000Z",
    lookbackDays: 45,
    summary: "Enterprise SaaS/product UI is strongest.",
    marketTemperature: [{
      lane: "Enterprise SaaS/product UI",
      temperature: "hot",
      score: 100,
      jobCount: 470,
      applyNowCount: 416,
      callbackRate: 0,
      topCompanies: companies,
      rationale: "Strong lane.",
    }],
    skillSignals: skills.map((skill, index) => ({
      skill,
      status: "rising",
      mentions: 100 - index,
      lanes: ["Enterprise SaaS/product UI"],
      guidance: `${skill} guidance.`,
    })),
    recommendedActions: [],
    sourceDigest: [],
    researchDigest: [],
    researchSynthesis: {
      mode: "deterministic",
      narrative: "",
      appObservedFacts: [],
      sourceBackedClaims: [],
      inferredRecommendations: [],
      contradictions: [],
      opportunities: [],
      risks: [],
      warnings: [],
    },
    chartData: { laneDemand: [], skillDemand: [], profileHealth: [], actionMix: [], matchQualityDistribution: [], sourceCoverage: [] },
    dataFreshness: { internalJobsAnalyzed: 293, applicationsAnalyzed: 0, profilesAnalyzed: 1, externalSourcesChecked: 10 },
    confidence: 0.9,
  };
}
