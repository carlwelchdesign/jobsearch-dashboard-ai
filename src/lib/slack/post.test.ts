import { beforeEach, describe, expect, it, vi } from "vitest";
import { postSlackMessage, resetSlackClientForTests } from "@/lib/slack/post";
import { prisma } from "@/lib/prisma";

const slackMocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  WebClient: vi.fn(),
}));

vi.mock("@slack/web-api", () => ({
  WebClient: slackMocks.WebClient,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationLog: {
      create: vi.fn(),
    },
  },
}));

const notificationLogCreateMock = vi.mocked(prisma.notificationLog.create);

describe("Slack posting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    slackMocks.WebClient.mockImplementation(function WebClientMock() {
      return { chat: { postMessage: slackMocks.postMessage } };
    });
    notificationLogCreateMock.mockResolvedValue({ id: "log_1" } as never);
    resetSlackClientForTests();
  });

  it("logs failed Slack delivery", async () => {
    slackMocks.postMessage.mockRejectedValue(new Error("rate_limited"));

    const result = await postSlackMessage({
      userId: "user_1",
      channel: "ops",
      text: "Slack test",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "Slack test" } }],
    });

    expect(result).toEqual({ status: "failed", channelId: "COPS", error: "rate_limited" });
    expect(notificationLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "slack",
        status: "failed",
        payload: expect.objectContaining({ error: "rate_limited" }),
      }),
    }));
  });

  it("skips cleanly when Slack env is missing", async () => {
    vi.unstubAllEnvs();

    const result = await postSlackMessage({
      userId: "user_1",
      channel: "ops",
      text: "Slack test",
      blocks: [],
    });

    expect(result.status).toBe("skipped");
    expect(slackMocks.postMessage).not.toHaveBeenCalled();
    expect(notificationLogCreateMock).not.toHaveBeenCalled();
  });
});
