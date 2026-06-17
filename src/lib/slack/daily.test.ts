import { describe, expect, it } from "vitest";
import { buildSlackDailyBriefingMessage, type SlackDailyBriefingData } from "@/lib/slack/daily";

const baseData: SlackDailyBriefingData = {
  kind: "morning",
  generatedAt: new Date("2026-06-17T14:00:00.000Z"),
  appBaseUrl: "http://localhost:3000",
  topOpportunities: [
    { id: "job_1", title: "Staff Frontend <Lead>", company: "Acme & Co", score: 92, status: "needs_review" },
  ],
  staleApplications: [],
  followUpsDue: [
    { id: "app_1", label: "Linear - Product Engineer", dueAt: new Date("2026-06-17T18:00:00.000Z"), kind: "application" },
  ],
  searchQualityIssues: ["2 profile changes need review <now>."],
  completedActions: [],
  unresolvedBlockers: [],
  decisionsMade: [],
  recommendedAction: "Open an opportunity room.",
};

describe("Slack daily briefing blocks", () => {
  it("builds a sanitized morning briefing", () => {
    const message = buildSlackDailyBriefingMessage(baseData);
    const serialized = JSON.stringify(message.blocks);

    expect(message.text).toBe("Job Search OS Morning Briefing");
    expect(serialized).toContain("Top opportunities");
    expect(serialized).toContain("Follow-ups due");
    expect(serialized).not.toContain("<Lead>");
    expect(serialized).not.toContain("& Co");
  });

  it("builds evening and focus variants with empty states", () => {
    const evening = buildSlackDailyBriefingMessage({ ...baseData, kind: "evening", topOpportunities: [], followUpsDue: [], searchQualityIssues: [] });
    const focus = buildSlackDailyBriefingMessage({ ...baseData, kind: "focus", topOpportunities: [], followUpsDue: [], searchQualityIssues: [] });

    expect(evening.text).toBe("Job Search OS Evening Briefing");
    expect(JSON.stringify(evening.blocks)).toContain("No failed or stale agent runs");
    expect(focus.text).toBe("Job Search OS Focus Plan");
    expect(JSON.stringify(focus.blocks)).toContain("No search quality issues detected");
  });
});
