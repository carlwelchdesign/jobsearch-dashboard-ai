import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeJsoCommand } from "@/lib/slack/commands";
import { buildJobSearchOsSlackStatus } from "@/lib/slack/status";
import { buildSlackDailyBriefing } from "@/lib/slack/daily";
import { buildSlackApprovalsMessage, buildSlackCommandCenterData, buildSlackRunsMessage } from "@/lib/slack/home";
import { openSlackOpportunityRoom } from "@/lib/slack/opportunity-room";

vi.mock("@/lib/slack/status", () => ({
  buildJobSearchOsSlackStatus: vi.fn(),
}));

vi.mock("@/lib/slack/home", () => ({
  buildSlackCommandCenterData: vi.fn(),
  buildSlackApprovalsMessage: vi.fn(),
  buildSlackRunsMessage: vi.fn(),
}));

vi.mock("@/lib/slack/daily", () => ({
  buildSlackDailyBriefing: vi.fn(),
}));

vi.mock("@/lib/slack/opportunity-room", () => ({
  openSlackOpportunityRoom: vi.fn(),
}));

describe("/jso command router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    vi.mocked(buildJobSearchOsSlackStatus).mockResolvedValue({ text: "status", blocks: [] });
    vi.mocked(buildSlackCommandCenterData).mockResolvedValue({ marker: "data" } as never);
    vi.mocked(buildSlackApprovalsMessage).mockReturnValue({ text: "approvals", blocks: [] });
    vi.mocked(buildSlackRunsMessage).mockReturnValue({ text: "runs", blocks: [] });
    vi.mocked(buildSlackDailyBriefing).mockResolvedValue({ text: "briefing", blocks: [] });
    vi.mocked(openSlackOpportunityRoom).mockResolvedValue({
      created: true,
      channelId: "COPS",
      threadTs: "123.456",
      message: { text: "room", blocks: [] },
    });
  });

  it("routes empty and status commands to the status message", async () => {
    await expect(routeJsoCommand("")).resolves.toEqual({ kind: "message", message: { text: "status", blocks: [] } });
    await expect(routeJsoCommand("status")).resolves.toEqual({ kind: "message", message: { text: "status", blocks: [] } });
  });

  it("routes approvals and runs to command-center messages", async () => {
    await expect(routeJsoCommand("approvals")).resolves.toEqual({ kind: "message", message: { text: "approvals", blocks: [] } });
    await expect(routeJsoCommand("runs")).resolves.toEqual({ kind: "message", message: { text: "runs", blocks: [] } });
    expect(buildSlackCommandCenterData).toHaveBeenCalledTimes(2);
  });

  it("routes internal run commands to confirmation modals", async () => {
    await expect(routeJsoCommand("run jolene")).resolves.toEqual({ kind: "run_modal", command: "jolene" });
    await expect(routeJsoCommand("run operating loop")).resolves.toEqual({ kind: "run_modal", command: "loop" });
    await expect(routeJsoCommand("run search team")).resolves.toEqual({ kind: "run_modal", command: "search-team" });
  });

  it("routes V3 briefing and opportunity commands", async () => {
    await expect(routeJsoCommand("morning")).resolves.toEqual({ kind: "message", message: { text: "briefing", blocks: [] } });
    await expect(routeJsoCommand("evening")).resolves.toEqual({ kind: "message", message: { text: "briefing", blocks: [] } });
    await expect(routeJsoCommand("focus")).resolves.toEqual({ kind: "message", message: { text: "briefing", blocks: [] } });
    await expect(routeJsoCommand("opportunity job_1")).resolves.toEqual({ kind: "message", message: { text: "room", blocks: [] } });

    expect(buildSlackDailyBriefing).toHaveBeenCalledWith("morning");
    expect(buildSlackDailyBriefing).toHaveBeenCalledWith("evening");
    expect(buildSlackDailyBriefing).toHaveBeenCalledWith("focus");
    expect(openSlackOpportunityRoom).toHaveBeenCalledWith("job_1");
  });

  it("requires allowed Slack users for opportunity room creation", async () => {
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "U_ALLOWED");

    await expect(routeJsoCommand("opportunity job_1", "U_BLOCKED")).rejects.toThrow("not allowed");
    expect(openSlackOpportunityRoom).not.toHaveBeenCalled();
  });

  it("routes coach summary to command-center data", async () => {
    vi.mocked(buildSlackCommandCenterData).mockResolvedValue({
      appBaseUrl: "http://localhost:3000",
      pendingApprovals: [],
      decisionLog: [],
    } as never);

    const route = await routeJsoCommand("coach summary");

    expect(route.kind).toBe("message");
    if (route.kind === "message") expect(route.message.text).toBe("Job Search OS coach summary");
  });

  it("returns help for unknown commands", async () => {
    const route = await routeJsoCommand("do everything");

    expect(route.kind).toBe("message");
    if (route.kind === "message") {
      expect(route.message.text).toBe("Unsupported /jso command");
    }
  });
});
