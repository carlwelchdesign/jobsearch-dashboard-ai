import type { SlackRunCommand } from "@/lib/slack/blocks";
import {
  actions,
  actionValue,
  compactBlocks,
  context,
  link,
  section,
  slackButton,
  SLACK_ACTIONS,
  type SlackBlock,
} from "@/lib/slack/blocks";
import { requireSingleUser } from "@/lib/auth/single-user";
import { recordJoleneExchange, sendJoleneMessage, type JoleneMessageSource, type SerializedJoleneMessage } from "@/lib/jolene/chat";
import { getSlackConfig, isSlackUserAllowed } from "@/lib/slack/config";
import { handleSlackRunModalSubmission } from "@/lib/slack/modals";
import { postSlackMessage } from "@/lib/slack/post";

type SlackJoleneMessageEvent = {
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

export type SlackJoleneChannelResult =
  | { handled: false; reason: string }
  | { handled: true; posted: boolean; reason?: string };

const SLACK_SECTION_LIMIT = 2600;

export async function handleSlackJoleneChannelMessage(input: {
  event: SlackJoleneMessageEvent;
}): Promise<SlackJoleneChannelResult> {
  const configResult = getSlackConfig();
  if (!configResult.configured) return { handled: false, reason: "slack_not_configured" };

  const config = configResult.config;
  if (!config.joleneChannelId) return { handled: false, reason: "jolene_channel_not_configured" };

  const event = input.event;
  if (event.channel !== config.joleneChannelId) return { handled: false, reason: "other_channel" };
  if (event.subtype || event.bot_id) return { handled: true, posted: false, reason: "ignored_bot_or_subtype" };
  if (!event.user || !event.ts) return { handled: true, posted: false, reason: "missing_user_or_ts" };

  const message = normalizeSlackJolenePrompt(event.text ?? "");
  if (!message) return { handled: true, posted: false, reason: "blank_message" };

  const threadTs = event.thread_ts ?? event.ts;
  const user = await requireSingleUser();

  if (!isSlackUserAllowed(event.user, config)) {
    await postJoleneReply({
      userId: user.id,
      threadTs,
      text: "This Slack user is not allowed to use Job Search OS Jolene actions.",
      blocks: compactBlocks([
        section("This Slack user is not allowed to use Job Search OS Jolene actions."),
        context([link(config.appBaseUrl, "Open Job Search OS")]),
      ]),
      payload: {
        source: "slack_jolene_channel",
        status: "blocked",
        reason: "unauthorized_user",
        channelId: event.channel,
        messageTs: event.ts,
        threadTs,
        slackUserId: event.user,
      },
    });
    return { handled: true, posted: true, reason: "unauthorized_user" };
  }

  const source: JoleneMessageSource = {
    kind: "slack",
    channelId: event.channel,
    messageTs: event.ts,
    threadTs,
    slackUserId: event.user,
    rawText: event.text ?? "",
  };

  const runCommand = parseDirectRunCommand(message);
  if (runCommand) {
    const result = await handleSlackRunModalSubmission({ command: runCommand, slackUserId: event.user });
    const payload = await recordJoleneExchange({
      userId: user.id,
      userMessage: message,
      assistantMessage: result.message,
      contextPath: "/dashboard",
      source,
      actionJson: {
        action: "slack_jolene_internal_run",
        command: runCommand,
        runId: result.runId,
        href: result.href,
      },
    });
    const reply = buildJoleneSlackReply({
      assistant: latestAssistantMessage(payload.messages),
      appBaseUrl: config.appBaseUrl,
      fallbackText: result.message,
    });
    await postJoleneReply({
      userId: user.id,
      threadTs,
      text: reply.text,
      blocks: reply.blocks,
      payload: {
        source: "slack_jolene_channel",
        action: "direct_internal_run",
        command: runCommand,
        runId: result.runId,
        channelId: event.channel,
        messageTs: event.ts,
        threadTs,
        slackUserId: event.user,
      },
    });
    return { handled: true, posted: true };
  }

  const payload = await sendJoleneMessage({
    userId: user.id,
    message,
    contextPath: "/dashboard",
    source,
  });
  const reply = buildJoleneSlackReply({
    assistant: latestAssistantMessage(payload.messages),
    appBaseUrl: config.appBaseUrl,
    fallbackText: "Jolene answered in Job Search OS.",
  });
  await postJoleneReply({
    userId: user.id,
    threadTs,
    text: reply.text,
    blocks: reply.blocks,
    payload: {
      source: "slack_jolene_channel",
      channelId: event.channel,
      messageTs: event.ts,
      threadTs,
      slackUserId: event.user,
      clientAction: payload.clientAction,
    },
  });

  return { handled: true, posted: true };
}

export function normalizeSlackJolenePrompt(text: string) {
  return text
    .replace(/^\s*<@[A-Z0-9]+>\s*[:,]?\s*/i, "")
    .replace(/^\s*jolene\s*[:,]?\s*/i, "")
    .trim();
}

export function buildJoleneSlackReply(input: {
  assistant: SerializedJoleneMessage | null;
  appBaseUrl: string;
  fallbackText: string;
}): { text: string; blocks: SlackBlock[] } {
  const assistant = input.assistant;
  const content = assistant?.content?.trim() || input.fallbackText;
  const actionJson = objectJson(assistant?.actionJson);
  const chunks = chunkSlackText(escapeSlackText(content), SLACK_SECTION_LIMIT);
  const resultLinks = parseResultLinks(actionJson.resultLinks, input.appBaseUrl);
  const requiresConfirmation = actionJson.requiresConfirmation === true;

  return {
    text: truncatePlainText(content, 3000),
    blocks: compactBlocks([
      ...chunks.map((chunk) => section(chunk)),
      resultLinks.length ? context(resultLinks.slice(0, 5)) : null,
      requiresConfirmation
        ? section("This needs confirmation inside Job Search OS. Open the app to review the confirmation card; Slack will not execute guarded or external actions directly.")
        : null,
      actions([
        slackButton({
          text: "Open Job Search OS",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: input.appBaseUrl }),
          url: input.appBaseUrl,
        }),
      ]),
      context([link(input.appBaseUrl, "Open app"), "Jolene Slack channel"]),
    ]),
  };
}

function parseDirectRunCommand(message: string): SlackRunCommand | null {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
  const match = /^(?:\/jso\s+)?run\s+(.+)$/.exec(normalized);
  if (!match) return null;
  const target = match[1].replace(/\s+/g, "-");
  if (target === "jolene" || target === "chief" || target === "chief-of-staff") return "jolene";
  if (target === "loop" || target === "operating-loop") return "loop";
  if (target === "search-team" || target === "recruiting-search-team") return "search-team";
  if (target === "email-ops" || target === "email") return "email-ops";
  return null;
}

async function postJoleneReply(input: {
  userId: string;
  threadTs: string;
  text: string;
  blocks: SlackBlock[];
  payload: Record<string, unknown>;
}) {
  const post = await postSlackMessage({
    userId: input.userId,
    channel: "jolene",
    text: input.text,
    blocks: input.blocks,
    threadTs: input.threadTs,
    payload: input.payload,
  });
  if (post.status === "failed") throw new Error(post.error);
  if (post.status === "skipped") throw new Error(`Jolene Slack reply skipped: ${post.reason}`);
  return post;
}

function latestAssistantMessage(messages: SerializedJoleneMessage[]) {
  return [...messages].reverse().find((message) => message.role === "ASSISTANT") ?? null;
}

function chunkSlackText(text: string, max: number) {
  if (text.length <= max) return [text || "Done."];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let splitAt = remaining.lastIndexOf("\n\n", max);
    if (splitAt < max * 0.4) splitAt = remaining.lastIndexOf("\n", max);
    if (splitAt < max * 0.4) splitAt = max;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function escapeSlackText(value: string) {
  return value.replace(/[<>&]/g, (char) => ({ "<": "‹", ">": "›", "&": "and" }[char] ?? char));
}

function truncatePlainText(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

function objectJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseResultLinks(value: unknown, appBaseUrl: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.href !== "string" || typeof record.label !== "string") return [];
    const href = record.href.startsWith("http") ? record.href : `${appBaseUrl}${record.href}`;
    return [link(href, record.label)];
  });
}
