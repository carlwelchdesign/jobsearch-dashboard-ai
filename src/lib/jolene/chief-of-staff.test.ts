import { describe, expect, it } from "vitest";
import { buildJoleneChiefBrief } from "@/lib/jolene/chief-of-staff";

type ChiefContext = Parameters<typeof buildJoleneChiefBrief>[0];

describe("buildJoleneChiefBrief", () => {
  it("prioritizes blockers and failed runs before optional delegated work", () => {
    const now = new Date("2026-06-13T18:00:00.000Z");
    const brief = buildJoleneChiefBrief({
      now,
      source: "manual",
      openRequests: [{ id: "request_1", type: "UNKNOWN_ANSWER", summary: "Need an answer before application work continues.", href: "/needs-me" }],
      recentRuns: [
        { id: "run_failed", agentType: "RECRUITING_AGENCY", status: "FAILED", createdAt: new Date("2026-06-13T15:00:00.000Z"), updatedAt: new Date("2026-06-13T15:00:00.000Z"), error: "packet failed", parentRunId: null },
        { id: "run_market", agentType: "MARKET_INTELLIGENCE", status: "COMPLETED", createdAt: new Date("2026-06-11T15:00:00.000Z"), updatedAt: new Date("2026-06-11T15:00:00.000Z"), error: null, parentRunId: null },
      ],
      latestSearchRun: { id: "search_1", status: "completed", startedAt: new Date("2026-06-10T15:00:00.000Z"), jobsFetched: 100, jobsSaved: 4, errors: [] },
      applicationCounts: { ready_to_apply: 2 },
      needsReviewCount: 4,
      readyApplicationCount: 2,
      latestMarketRun: null,
      latestLinkedInDraft: null,
      linkedInAnalytics: { posts: 1, impressions: 300, engagementRate: 0.08 },
      careerStandup: {
        generatedAt: now.toISOString(),
        sprintScore: 71,
        incomeMomentum: "flat",
        attentionDebt: 1,
        proactivePromptReason: "One money move is aging.",
        brief: {} as never,
        moneyMoveStatus: [],
        completedMoveKeys: [],
        delta: { sprintScoreChange: null, attentionDebtChange: null, newMoveCount: 0, completedMoveCount: 0 },
      },
    } satisfies ChiefContext);

    expect(brief.title).toBe("Jolene, Chief of Staff");
    expect(brief.priorities[0]).toMatchObject({ id: "resolve-agent-blockers", category: "blocker" });
    expect(brief.priorities[1]).toMatchObject({ id: "review-agent-health", category: "agent_health" });
    expect(brief.delegatedWork).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: "run_job_search", status: "proposed" }),
      expect.objectContaining({ actionId: "run_market_intelligence", status: "proposed" }),
      expect.objectContaining({ actionId: "generate_linkedin_content", status: "proposed" }),
    ]));
    expect(brief.approvalRequests.length).toBe(brief.delegatedWork.length);
    expect(brief.evidence).toEqual(expect.arrayContaining([
      "1 open agent blocker(s).",
      "2 ready application(s), 4 job(s) need review.",
    ]));
  });
});
