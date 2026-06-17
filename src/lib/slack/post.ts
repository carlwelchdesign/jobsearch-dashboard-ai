import { WebClient } from "@slack/web-api";
import type { Prisma } from "@prisma/client";
import type { SlackBlock } from "@/lib/slack/blocks";
import { getSlackConfig, type SlackConfig } from "@/lib/slack/config";
import { prisma } from "@/lib/prisma";

type SlackChannel = "ops" | "approvals" | "decision_log";

export type PostSlackMessageInput = {
  userId: string;
  channel: SlackChannel;
  text: string;
  blocks: SlackBlock[];
  threadTs?: string | null;
  replyBroadcast?: boolean;
  payload?: Record<string, unknown>;
};

type SlackPostResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; channelId: string; ts: string | undefined }
  | { status: "failed"; channelId: string; error: string };

let clientCache: InstanceType<typeof WebClient> | null = null;
let clientToken: string | null = null;

export async function postSlackMessage(input: PostSlackMessageInput): Promise<SlackPostResult> {
  const result = getSlackConfig();
  if (!result.configured) return { status: "skipped", reason: `missing ${result.missing.join(", ")}` };

  const channelId = channelIdFor(input.channel, result.config);
  if (!channelId) return { status: "skipped", reason: `${input.channel} channel is not configured` };

  try {
    const messageArgs = {
      channel: channelId,
      text: input.text,
      blocks: input.blocks,
      unfurl_links: false,
      unfurl_media: false,
    };
    if (input.threadTs) Object.assign(messageArgs, { thread_ts: input.threadTs });
    if (input.replyBroadcast) Object.assign(messageArgs, { reply_broadcast: true });

    const response = await slackClient(result.config).chat.postMessage(messageArgs);
    await logSlackDelivery({
      userId: input.userId,
      subject: input.text,
      body: input.text,
      status: response.ok ? "sent" : "failed",
      payload: {
        ...input.payload,
        channel: input.channel,
        channelId,
        threadTs: input.threadTs ?? null,
        response: response as unknown as Prisma.InputJsonValue,
      },
      sentAt: response.ok ? new Date() : null,
    });
    if (response.ok) return { status: "sent", channelId, ts: response.ts };
    return { status: "failed", channelId, error: "Slack API returned ok=false." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slack post failed.";
    await logSlackDelivery({
      userId: input.userId,
      subject: input.text,
      body: input.text,
      status: "failed",
      payload: {
        ...input.payload,
        channel: input.channel,
        channelId,
        threadTs: input.threadTs ?? null,
        error: message,
      },
      sentAt: null,
    });
    return { status: "failed", channelId, error: message };
  }
}

export async function logSlackAction(input: {
  userId: string;
  subject: string;
  body: string;
  status: "sent" | "failed" | "executed" | "skipped";
  payload?: Record<string, unknown>;
}) {
  return logSlackDelivery({
    userId: input.userId,
    subject: input.subject,
    body: input.body,
    status: input.status,
    payload: input.payload ?? {},
    sentAt: input.status === "sent" || input.status === "executed" ? new Date() : null,
  });
}

export function resetSlackClientForTests() {
  clientCache = null;
  clientToken = null;
}

function slackClient(config: SlackConfig): InstanceType<typeof WebClient> {
  if (!clientCache || clientToken !== config.botToken) {
    clientCache = new WebClient(config.botToken);
    clientToken = config.botToken;
  }
  return clientCache;
}

function channelIdFor(channel: SlackChannel, config: SlackConfig) {
  if (channel === "ops") return config.opsChannelId;
  if (channel === "approvals") return config.approvalsChannelId;
  return config.decisionLogChannelId;
}

async function logSlackDelivery(input: {
  userId: string;
  subject: string;
  body: string;
  status: string;
  payload: Record<string, unknown>;
  sentAt: Date | null;
}) {
  return prisma.notificationLog.create({
    data: {
      userId: input.userId,
      type: "slack",
      subject: input.subject.slice(0, 255),
      body: input.body,
      payload: input.payload as Prisma.InputJsonValue,
      status: input.status,
      sentAt: input.sentAt,
    },
  });
}
