import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordJoleneExchange, sendJoleneMessage } from "@/lib/jolene/chat";
import { requireSingleUser } from "@/lib/auth/single-user";
import { handleSlackRunModalSubmission } from "@/lib/slack/modals";
import { buildJoleneSlackReply, handleSlackJoleneChannelMessage, normalizeSlackJolenePrompt } from "@/lib/slack/jolene-channel";
import { postSlackMessage } from "@/lib/slack/post";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/jolene/chat", () => ({
  sendJoleneMessage: vi.fn(),
  recordJoleneExchange: vi.fn(),
}));

vi.mock("@/lib/slack/modals", () => ({
  handleSlackRunModalSubmission: vi.fn(),
}));

vi.mock("@/lib/slack/post", () => ({
  postSlackMessage: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const sendJoleneMessageMock = vi.mocked(sendJoleneMessage);
const recordJoleneExchangeMock = vi.mocked(recordJoleneExchange);
const handleSlackRunModalSubmissionMock = vi.mocked(handleSlackRunModalSubmission);
const postSlackMessageMock = vi.mocked(postSlackMessage);

describe("Slack Jolene channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-token");
    vi.stubEnv("SLACK_OPS_CHANNEL_ID", "COPS");
    vi.stubEnv("SLACK_APPROVALS_CHANNEL_ID", "CAPPROVALS");
    vi.stubEnv("SLACK_OPS_JOLENE_ID", "CJOLENE");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "");
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    postSlackMessageMock.mockResolvedValue({ status: "sent", channelId: "CJOLENE", ts: "125.000" });
    sendJoleneMessageMock.mockResolvedValue(chatPayload("assistant_1", "Jolene answered.") as never);
    recordJoleneExchangeMock.mockResolvedValue(chatPayload("assistant_run", "Email Ops reviewed 2 message(s).") as never);
    handleSlackRunModalSubmissionMock.mockResolvedValue({
      runId: "run_email",
      message: "Email Ops reviewed 2 message(s).",
      href: "http://localhost:3000/dashboard/email-ops",
    });
  });

  it("ignores messages outside the configured Jolene channel", async () => {
    const result = await handleSlackJoleneChannelMessage({
      event: { channel: "COPS", user: "U1", text: "what now?", ts: "123.000" },
    });

    expect(result).toEqual({ handled: false, reason: "other_channel" });
    expect(sendJoleneMessageMock).not.toHaveBeenCalled();
    expect(postSlackMessageMock).not.toHaveBeenCalled();
  });

  it("ignores bot, subtype, and blank channel messages", async () => {
    await expect(handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", bot_id: "B1", text: "bot", ts: "123.000" },
    })).resolves.toMatchObject({ handled: true, posted: false });
    await expect(handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", subtype: "message_changed", text: "edit", ts: "123.001" },
    })).resolves.toMatchObject({ handled: true, posted: false });
    await expect(handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", text: "Jolene", ts: "123.002" },
    })).resolves.toMatchObject({ handled: true, posted: false, reason: "blank_message" });

    expect(requireSingleUserMock).not.toHaveBeenCalled();
    expect(postSlackMessageMock).not.toHaveBeenCalled();
  });

  it("sends top-level prompts to Jolene and replies in the prompt thread", async () => {
    const result = await handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", text: "Jolene, what are my top actions?", ts: "123.000" },
    });

    expect(result).toEqual({ handled: true, posted: true });
    expect(sendJoleneMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      message: "what are my top actions?",
      contextPath: "/dashboard",
      source: expect.objectContaining({
        kind: "slack",
        channelId: "CJOLENE",
        messageTs: "123.000",
        threadTs: "123.000",
        slackUserId: "U1",
      }),
    }));
    expect(postSlackMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: "jolene",
      threadTs: "123.000",
      text: "Jolene answered.",
    }));
  });

  it("continues existing Slack threads", async () => {
    await handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", text: "follow up", ts: "124.000", thread_ts: "123.000" },
    });

    expect(sendJoleneMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ messageTs: "124.000", threadTs: "123.000" }),
    }));
    expect(postSlackMessageMock).toHaveBeenCalledWith(expect.objectContaining({ threadTs: "123.000" }));
  });

  it("enforces allowed Slack users", async () => {
    vi.stubEnv("SLACK_ALLOWED_USER_IDS", "U_ALLOWED");

    const result = await handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U_BLOCKED", text: "what now?", ts: "123.000" },
    });

    expect(result).toEqual({ handled: true, posted: true, reason: "unauthorized_user" });
    expect(sendJoleneMessageMock).not.toHaveBeenCalled();
    expect(postSlackMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: "jolene",
      threadTs: "123.000",
      text: expect.stringContaining("not allowed"),
      payload: expect.objectContaining({ status: "blocked", reason: "unauthorized_user" }),
    }));
  });

  it("executes direct safe internal run commands from Slack", async () => {
    await handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", text: "run email ops", ts: "123.000" },
    });

    expect(handleSlackRunModalSubmissionMock).toHaveBeenCalledWith({ command: "email-ops", slackUserId: "U1" });
    expect(recordJoleneExchangeMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      userMessage: "run email ops",
      assistantMessage: "Email Ops reviewed 2 message(s).",
      actionJson: expect.objectContaining({
        action: "slack_jolene_internal_run",
        command: "email-ops",
        runId: "run_email",
      }),
    }));
  });

  it("surfaces guarded Slack requests as app confirmations instead of executing them", async () => {
    sendJoleneMessageMock.mockResolvedValue(chatPayload("assistant_guarded", "I can help, but this needs confirmation.", {
      requiresConfirmation: true,
      plannedActions: [{ id: "external_submit_or_send", executable: false }],
    }) as never);

    await handleSlackJoleneChannelMessage({
      event: { channel: "CJOLENE", user: "U1", text: "send this recruiter an email", ts: "123.000" },
    });

    expect(handleSlackRunModalSubmissionMock).not.toHaveBeenCalled();
    expect(postSlackMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({ text: expect.stringContaining("needs confirmation inside Job Search OS") }),
        }),
      ]),
    }));
  });

  it("chunks long Jolene replies for Slack blocks", () => {
    const longReply = Array.from({ length: 80 }, (_, index) => `Line ${index}: ${"x".repeat(80)}`).join("\n");
    const reply = buildJoleneSlackReply({
      assistant: {
        id: "assistant_1",
        role: "ASSISTANT",
        content: longReply,
        actionJson: {},
        createdAt: new Date("2026-06-17T12:00:00.000Z").toISOString(),
      },
      appBaseUrl: "http://localhost:3000",
      fallbackText: "Done.",
    });

    const sections = reply.blocks.filter((block) => block.type === "section");
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((block) => {
      const textObject = "text" in block && block.text && typeof block.text === "object" ? block.text : null;
      const text = textObject && "text" in textObject ? textObject.text : "";
      return text.length <= 2800;
    })).toBe(true);
  });

  it("strips mentions and simple Jolene prefixes", () => {
    expect(normalizeSlackJolenePrompt("<@U123> Jolene, show my blockers")).toBe("show my blockers");
    expect(normalizeSlackJolenePrompt("Jolene: show my blockers")).toBe("show my blockers");
  });
});

function chatPayload(id: string, content: string, actionJson: Record<string, unknown> = {}) {
  return {
    conversation: { id: "conversation_1", contextPath: "/dashboard", title: "Jolene" },
    context: { routeType: "dashboard", summary: "Dashboard", suggestedActions: [] },
    clientAction: null,
    messages: [
      {
        id: "user_message_1",
        role: "USER",
        content: "prompt",
        actionJson: {},
        createdAt: new Date("2026-06-17T12:00:00.000Z").toISOString(),
      },
      {
        id,
        role: "ASSISTANT",
        content,
        actionJson,
        createdAt: new Date("2026-06-17T12:00:01.000Z").toISOString(),
      },
    ],
  };
}
