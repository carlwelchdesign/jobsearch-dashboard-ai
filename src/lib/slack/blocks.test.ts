import { describe, expect, it } from "vitest";
import {
  buildSearchOptimizationApprovalMessage,
  buildStatusMessage,
  parseActionValue,
  SLACK_ACTIONS,
} from "@/lib/slack/blocks";

describe("Slack block builders", () => {
  it("builds redacted search optimization action blocks", () => {
    const message = buildSearchOptimizationApprovalMessage({
      appBaseUrl: "http://localhost:3000",
      summary: {
        optimizationRunId: "opt_1",
        agentRunId: "run_1",
        generatedAt: "2026-06-17T00:00:00.000Z",
        mode: "active",
        targetMetric: "QUALIFIED_YIELD",
        qualifiedYield: 0.42,
        runQualityLabel: "Needs review",
        summary: "Tighten noisy searches",
        gate: { canAutoApply: false, reasons: [] },
        specialists: [],
        changes: [{
          id: "change_1",
          profileId: "profile_1",
          profileName: "Chief <of> Staff & Ops",
          action: "ADD_EXCLUDED_KEYWORDS",
          status: "REVIEW_ONLY",
          riskLevel: "LOW",
          rationale: "Remove repeated broad matches <raw>",
        }],
        nextActions: [],
      },
    });

    expect(message?.text).toContain("1 search profile action");
    expect(JSON.stringify(message?.blocks)).not.toContain("<raw>");
    expect(JSON.stringify(message?.blocks)).toContain(SLACK_ACTIONS.applySearchProfileChange);
    expect(JSON.stringify(message?.blocks)).toContain(SLACK_ACTIONS.needsEvidence);
    expect(JSON.stringify(message?.blocks)).toContain(SLACK_ACTIONS.discussInThread);
    const actionBlock = message?.blocks.find((block) => "elements" in block && Array.isArray(block.elements));
    const button = actionBlock && "elements" in actionBlock ? actionBlock.elements[0] : null;
    expect(button && "value" in button && button.value ? parseActionValue(button.value).kind : null).toBe("apply_search_profile_change");
    const needsEvidence = actionBlock && "elements" in actionBlock
      ? actionBlock.elements.find((element) => "action_id" in element && element.action_id === SLACK_ACTIONS.needsEvidence)
      : null;
    expect(needsEvidence && "value" in needsEvidence && needsEvidence.value ? parseActionValue(needsEvidence.value).kind : null).toBe("needs_evidence");
  });

  it("builds read-only status blocks", () => {
    const message = buildStatusMessage({
      generatedAt: new Date("2026-06-17T12:00:00.000Z"),
      appBaseUrl: "http://localhost:3000",
      latestChiefRun: null,
      latestOperatingLoopRun: null,
      latestSearchOptimizationRun: null,
      openSearchProfileChanges: 2,
      readyApplications: 3,
      needsReviewJobs: 4,
    });

    expect(message.text).toBe("Job Search OS status");
    expect(JSON.stringify(message.blocks)).toContain("Ready applications");
    expect(JSON.stringify(message.blocks)).toContain("Open Job Search OS");
  });
});
