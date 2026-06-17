import { describe, expect, it } from "vitest";
import { buildSlackApprovalsMessage, buildSlackHomeView, buildSlackRunsMessage, type SlackCommandCenterData } from "@/lib/slack/home";
import { SLACK_ACTIONS } from "@/lib/slack/blocks";

const data: SlackCommandCenterData = {
  generatedAt: new Date("2026-06-17T12:00:00.000Z"),
  appBaseUrl: "http://localhost:3000",
  readyApplications: 2,
  needsReviewJobs: 5,
  openSearchProfileChanges: 1,
  unhealthyAgentRuns: 1,
  pendingApprovals: [
    {
      label: "Jolene <Chief>",
      count: 2,
      href: "http://localhost:3000/dashboard",
      detail: "Approve internal work <only>.",
    },
  ],
  latestRuns: [
    {
      id: "run_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      status: "COMPLETED",
      updatedAt: new Date("2026-06-17T11:00:00.000Z"),
      summary: "Reviewed <private> queue.",
      href: "http://localhost:3000/agents",
    },
  ],
  decisionLog: [
    {
      subject: "Slack started <work>",
      status: "executed",
      createdAt: new Date("2026-06-17T10:00:00.000Z"),
    },
  ],
};

describe("Slack Home command center", () => {
  it("builds a sanitized Home tab view with safe run starters", () => {
    const view = buildSlackHomeView(data);
    const serialized = JSON.stringify(view);

    expect(view.type).toBe("home");
    expect(serialized).toContain("Job Search OS Command Center");
    expect(serialized).toContain("Ready applications");
    expect(serialized).toContain(SLACK_ACTIONS.refreshHome);
    expect(serialized).toContain(SLACK_ACTIONS.openRunModal);
    expect(serialized).toContain("Run Jolene brief");
    expect(serialized).not.toContain("<private>");
    expect(serialized).not.toContain("<Chief>");
  });

  it("builds approvals and runs command messages from the same data", () => {
    const approvals = buildSlackApprovalsMessage(data);
    const runs = buildSlackRunsMessage(data);

    expect(approvals.text).toBe("Job Search OS approvals");
    expect(JSON.stringify(approvals.blocks)).toContain("Jolene");
    expect(runs.text).toBe("Job Search OS recent runs");
    expect(JSON.stringify(runs.blocks)).toContain("JOLENE_CHIEF_OF_STAFF");
  });
});
