import { describe, expect, it } from "vitest";
import { buildJoleneOperatingLoopOutput, type JoleneOperatingLoopOutput } from "@/lib/jolene/operating-loop";
import type { JoleneChiefOutput } from "@/lib/jolene/chief-of-staff";

describe("Jolene Operating Loop", () => {
  it("turns the Chief of Staff brief into a propose-first operating plan", () => {
    const output = buildJoleneOperatingLoopOutput(chiefOutput(), {
      id: "chief_run_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      status: "COMPLETED",
    } as never);

    expect(output.title).toBe("Jolene Operating Loop");
    expect(output.autonomyPolicy).toBe("propose_first");
    expect(output.recommendedActions).toEqual([
      expect.objectContaining({
        id: "loop_work_email_ops",
        actionId: "run_email_ops",
        status: "proposed",
      }),
    ]);
    expect(output.approvalRequests).toEqual([
      expect.objectContaining({
        proposalId: "loop_work_email_ops",
        label: "Run Email Ops",
      }),
    ]);
    expect(output.childRuns).toEqual([
      expect.objectContaining({
        role: "Chief of Staff brief",
        runId: "chief_run_1",
      }),
    ]);
  });

  it("always records external work as skipped instead of auto-runnable", () => {
    const output: JoleneOperatingLoopOutput = buildJoleneOperatingLoopOutput(chiefOutput(), {
      id: "chief_run_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      status: "COMPLETED",
    } as never);

    expect(output.skippedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "external-actions-blocked",
        reason: expect.stringContaining("No LinkedIn publishing"),
      }),
    ]));
    expect(output.recommendedActions.every((action) => action.status === "proposed")).toBe(true);
  });
});

function chiefOutput(): JoleneChiefOutput {
  return {
    generatedAt: "2026-06-14T20:00:00.000Z",
    title: "Jolene, Chief of Staff",
    summary: "Email Ops is stale and should be refreshed.",
    confidence: "high",
    priorities: [],
    delegatedWork: [{
      id: "work_email_ops",
      actionId: "run_email_ops",
      label: "Run Email Ops",
      detail: "Scan recent job-response email.",
      href: "/dashboard/email-ops",
      risk: "approval_required",
      status: "proposed",
    }],
    blockers: ["Gmail needs reauth"],
    risks: ["Inbox stale"],
    evidence: ["Email Ops: last scan missed recent mail"],
    approvalRequests: [],
    careerStandup: null,
    rationale: "Email Ops is stale and should be checked before optional work.",
  };
}
