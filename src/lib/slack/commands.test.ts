import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeJsoCommand } from "@/lib/slack/commands";
import { buildJobSearchOsSlackStatus } from "@/lib/slack/status";
import { buildSlackApprovalsMessage, buildSlackCommandCenterData, buildSlackRunsMessage } from "@/lib/slack/home";

vi.mock("@/lib/slack/status", () => ({
  buildJobSearchOsSlackStatus: vi.fn(),
}));

vi.mock("@/lib/slack/home", () => ({
  buildSlackCommandCenterData: vi.fn(),
  buildSlackApprovalsMessage: vi.fn(),
  buildSlackRunsMessage: vi.fn(),
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

  it("returns help for unknown commands", async () => {
    const route = await routeJsoCommand("do everything");

    expect(route.kind).toBe("message");
    if (route.kind === "message") {
      expect(route.message.text).toBe("Unsupported /jso command");
    }
  });
});
