import { loadEnvConfig } from "@next/env";
import { App, LogLevel } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { View } from "@slack/types";
import { appendActionResult, parseActionValue, SLACK_ACTIONS, type SlackBlock } from "@/lib/slack/blocks";
import { assertSlackUserCanMutate, handleSlackAction } from "@/lib/slack/actions";
import { routeJsoCommand } from "@/lib/slack/commands";
import { isSlackCoachUser, requireSlackConfig } from "@/lib/slack/config";
import { buildSlackCommandCenterData, buildSlackHomeView } from "@/lib/slack/home";
import { handleSlackJoleneChannelMessage, type SlackJoleneChannelResult } from "@/lib/slack/jolene-channel";
import { captureSlackThreadReply } from "@/lib/slack/opportunity-room";
import {
  buildRunAcceptedModal,
  buildRunConfirmationModal,
  buildRunFailedModal,
  handleSlackRunModalSubmission,
  parseRunModalMetadata,
  SLACK_VIEW_CALLBACKS,
} from "@/lib/slack/modals";

loadEnvConfig(process.cwd());

const config = requireSlackConfig();
const processedJoleneMessageTs = new Set<string>();
const activeJoleneThreadTs = new Set<string>();

type SlackMessageEvent = {
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  signingSecret: config.signingSecret,
  socketMode: true,
  logLevel: process.env.SLACK_LOG_LEVEL === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
});

app.command("/jso", async ({ command, ack, respond }) => {
  await ack();
  try {
    const route = await routeJsoCommand(command.text, command.user_id);
    if (route.kind === "message") {
      await respond({ response_type: "ephemeral", text: route.message.text, blocks: route.message.blocks });
      return;
    }
    assertSlackUserCanMutate(command.user_id);
    await app.client.views.open({
      trigger_id: command.trigger_id,
      view: buildRunConfirmationModal(route.command),
    });
  } catch (error) {
    await respond({ response_type: "ephemeral", text: errorMessage(error) });
  }
});

app.event("app_home_opened", async ({ event, client }) => {
  try {
    await publishHome(client, event.user);
  } catch (error) {
    console.error("[slack] failed to publish home", error);
  }
});

app.event("message", async ({ event }) => {
  const messageEvent = event as SlackMessageEvent;

  try {
    const joleneResult = await routeSlackJoleneChannelMessage(messageEvent, "socket");
    if (joleneResult.handled) return;
  } catch (error) {
    console.error("[slack] failed to handle Jolene channel message", error);
    return;
  }

  if (messageEvent.subtype || messageEvent.bot_id || !messageEvent.user || !messageEvent.channel || !messageEvent.thread_ts || !messageEvent.ts) return;
  if (messageEvent.thread_ts === messageEvent.ts) return;
  if (!isSlackCoachUser(messageEvent.user, config)) return;

  try {
    await captureSlackThreadReply({
      channelId: messageEvent.channel,
      threadTs: messageEvent.thread_ts,
      messageTs: messageEvent.ts,
      slackUserId: messageEvent.user,
      text: messageEvent.text ?? "",
    });
  } catch (error) {
    console.error("[slack] failed to capture coach thread reply", error);
  }
});

app.action(SLACK_ACTIONS.refreshHome, async ({ ack, body, client, respond }) => {
  await ack();
  const slackUserId = "user" in body && body.user ? body.user.id : null;
  if (!slackUserId) {
    await respond({ response_type: "ephemeral", text: "Slack user was not available." });
    return;
  }
  try {
    await publishHome(client, slackUserId);
    await respond({ response_type: "ephemeral", text: "Job Search OS Command Center refreshed." });
  } catch (error) {
    await respond({ response_type: "ephemeral", text: errorMessage(error) });
  }
});

app.action(SLACK_ACTIONS.openRunModal, async ({ ack, body, action, client, respond }) => {
  await ack();
  if (action.type !== "button") return;
  const slackUserId = "user" in body && body.user ? body.user.id : null;
  const triggerId = "trigger_id" in body ? body.trigger_id : null;
  try {
    assertSlackUserCanMutate(slackUserId);
    const payload = parseActionValue(action.value ?? "");
    if (payload.kind !== "open_run_modal") throw new Error("Slack run action payload is invalid.");
    if (!triggerId) throw new Error("Slack trigger id was not available.");
    await client.views.open({
      trigger_id: triggerId,
      view: buildRunConfirmationModal(payload.command),
    });
  } catch (error) {
    await respond({ response_type: "ephemeral", text: errorMessage(error) });
  }
});

app.action(SLACK_ACTIONS.openLink, async ({ ack }) => {
  await ack();
});

app.view(SLACK_VIEW_CALLBACKS.runInternal, async ({ ack, body, view, client }) => {
  const slackUserId = "user" in body && body.user ? body.user.id : null;
  let command = null as ReturnType<typeof parseRunModalMetadata>["command"] | null;
  try {
    const metadata = parseRunModalMetadata(view.private_metadata);
    command = metadata.command;
    assertSlackUserCanMutate(slackUserId);
    await ack({ response_action: "update", view: buildRunAcceptedModal(command) });
    handleSlackRunModalSubmission({ command, slackUserId })
      .then(async () => {
        if (slackUserId) await publishHome(client, slackUserId);
      })
      .catch((error) => {
        console.error("[slack] internal run failed", error);
      });
  } catch (error) {
    await ack({
      response_action: "update",
      view: buildRunFailedModal(command ?? "jolene", errorMessage(error)),
    });
  }
});

const approvalActionIds = [
  SLACK_ACTIONS.approveChiefProposal,
  SLACK_ACTIONS.approveOperatingLoopProposal,
  SLACK_ACTIONS.applySearchProfileChange,
  SLACK_ACTIONS.rollbackSearchProfileChange,
  SLACK_ACTIONS.rejectRecommendation,
  SLACK_ACTIONS.needsEvidence,
  SLACK_ACTIONS.discussInThread,
  SLACK_ACTIONS.markReviewed,
  SLACK_ACTIONS.captureCoachNote,
];

for (const actionId of approvalActionIds) {
  app.action(actionId, async ({ ack, body, action, client, respond }) => {
    await ack();
    if (action.type !== "button") return;

    const slackUserId = "user" in body && body.user ? body.user.id : null;
    const channelId = "channel" in body && body.channel ? body.channel.id : null;
    const messageTs = "message" in body && body.message ? body.message.ts : null;
    const originalBlocks = "message" in body && body.message ? body.message.blocks as SlackBlock[] | undefined : undefined;

    try {
      const result = await handleSlackAction({
        actionId,
        value: action.value ?? "",
        slackUserId,
      });
      await respond({ response_type: "ephemeral", text: result.message });
      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: result.message,
          blocks: appendActionResult(originalBlocks, result.message, result.ok),
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      await respond({ response_type: "ephemeral", text: message });
      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: message,
          blocks: appendActionResult(originalBlocks, message, false),
        });
      }
    }
  });
}

app.error(async (error) => {
  console.error("[slack] worker error", error);
});

app.start().then(() => {
  console.log(
    `[slack] Job Search OS Slack worker is running in Socket Mode. Jolene channel: ${config.joleneChannelId ?? "not configured"}.`,
  );
  startJoleneChannelHistoryPolling();
}).catch((error) => {
  console.error("[slack] failed to start", error);
  process.exit(1);
});

async function routeSlackJoleneChannelMessage(
  messageEvent: SlackMessageEvent,
  source: "socket" | "history_poll" | "history_poll_thread",
): Promise<SlackJoleneChannelResult> {
  const joleneMessageTs = config.joleneChannelId && messageEvent.channel === config.joleneChannelId ? messageEvent.ts : null;
  if (joleneMessageTs) {
    if (processedJoleneMessageTs.has(joleneMessageTs)) {
      return { handled: true, posted: false, reason: "duplicate_message" };
    }
    rememberJoleneMessage(joleneMessageTs);
  }

  try {
    const joleneResult = await handleSlackJoleneChannelMessage({ event: messageEvent });
    if (joleneResult.handled) {
      console.log(
        `[slack] Jolene channel message ${joleneResult.posted ? "posted" : "handled"} via ${source} (${joleneResult.reason ?? "ok"}).`,
      );
    } else if (joleneMessageTs) {
      processedJoleneMessageTs.delete(joleneMessageTs);
    }
    return joleneResult;
  } catch (error) {
    if (joleneMessageTs) processedJoleneMessageTs.delete(joleneMessageTs);
    throw error;
  }
}

function startJoleneChannelHistoryPolling() {
  if (!config.joleneChannelId) return;

  const pollIntervalMs = parsePositiveInteger(process.env.SLACK_JOLENE_POLL_INTERVAL_MS, 10_000);
  const startedAtSeconds = Date.now() / 1000;
  let inFlight = false;

  const poll = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const history = await app.client.conversations.history({
        channel: config.joleneChannelId!,
        limit: 15,
      });
      const messages = ((history.messages ?? []) as Array<{
        subtype?: string;
        bot_id?: string;
        reply_count?: number;
        latest_reply?: string;
        user?: string;
        text?: string;
        ts?: string;
        thread_ts?: string;
      }>)
        .filter((message) => {
          if (message.subtype || message.bot_id || !message.user || !message.ts || !message.text?.trim()) return false;
          const messageSeconds = Number.parseFloat(message.ts);
          return Number.isFinite(messageSeconds) && messageSeconds >= startedAtSeconds - 1;
        })
        .sort((a, b) => Number.parseFloat(a.ts ?? "0") - Number.parseFloat(b.ts ?? "0"));

      for (const message of messages) {
        if (message.ts) rememberJoleneThread(message.thread_ts ?? message.ts);
        await routeSlackJoleneChannelMessage({
          channel: config.joleneChannelId!,
          user: message.user,
          text: message.text,
          ts: message.ts,
          thread_ts: message.thread_ts,
        }, "history_poll");
      }

      const threadRoots = ((history.messages ?? []) as Array<{
        subtype?: string;
        bot_id?: string;
        reply_count?: number;
        latest_reply?: string;
        user?: string;
        text?: string;
        ts?: string;
        thread_ts?: string;
      }>)
        .filter((message) => {
          if (!message.ts || message.subtype || message.bot_id || !message.user || !message.text?.trim()) return false;
          const messageSeconds = Number.parseFloat(message.ts);
          const latestReplySeconds = Number.parseFloat(message.latest_reply ?? "0");
          return (
            activeJoleneThreadTs.has(message.ts)
            || (Number.isFinite(messageSeconds) && messageSeconds >= startedAtSeconds - 1)
            || (Number.isFinite(latestReplySeconds) && latestReplySeconds >= startedAtSeconds - 1)
            || (message.reply_count ?? 0) > 0
          );
        })
        .map((message) => message.thread_ts ?? message.ts)
        .filter((threadTs): threadTs is string => Boolean(threadTs))
        .slice(0, 10);

      for (const threadTs of threadRoots) {
        rememberJoleneThread(threadTs);
        await pollJoleneThreadReplies(threadTs, startedAtSeconds);
      }
    } catch (error) {
      console.error("[slack] Jolene channel history polling failed", errorMessage(error));
    } finally {
      inFlight = false;
    }
  };

  setTimeout(() => void poll(), 2_500);
  setInterval(() => void poll(), pollIntervalMs);
  console.log(`[slack] Jolene channel history polling enabled every ${pollIntervalMs}ms.`);
}

function rememberJoleneMessage(messageTs: string) {
  processedJoleneMessageTs.add(messageTs);
  if (processedJoleneMessageTs.size <= 500) return;
  const oldest = processedJoleneMessageTs.values().next().value;
  if (oldest) processedJoleneMessageTs.delete(oldest);
}

function rememberJoleneThread(threadTs: string) {
  activeJoleneThreadTs.add(threadTs);
  if (activeJoleneThreadTs.size <= 100) return;
  const oldest = activeJoleneThreadTs.values().next().value;
  if (oldest) activeJoleneThreadTs.delete(oldest);
}

async function pollJoleneThreadReplies(threadTs: string, startedAtSeconds: number) {
  const replies = await app.client.conversations.replies({
    channel: config.joleneChannelId!,
    ts: threadTs,
    limit: 20,
  });
  const messages = ((replies.messages ?? []) as Array<{
    subtype?: string;
    bot_id?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
  }>)
    .filter((message) => {
      if (message.subtype || message.bot_id || !message.user || !message.ts || !message.text?.trim()) return false;
      if (message.ts === threadTs) return false;
      const messageSeconds = Number.parseFloat(message.ts);
      return Number.isFinite(messageSeconds) && messageSeconds >= startedAtSeconds - 1;
    })
    .sort((a, b) => Number.parseFloat(a.ts ?? "0") - Number.parseFloat(b.ts ?? "0"));

  for (const message of messages) {
    await routeSlackJoleneChannelMessage({
      channel: config.joleneChannelId!,
      user: message.user,
      text: message.text,
      ts: message.ts,
      thread_ts: message.thread_ts ?? threadTs,
    }, "history_poll_thread");
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Slack action failed.";
}

async function publishHome(client: WebClient, slackUserId: string) {
  const data = await buildSlackCommandCenterData();
  await client.views.publish({
    user_id: slackUserId,
    view: buildSlackHomeView(data) as View,
  });
}
