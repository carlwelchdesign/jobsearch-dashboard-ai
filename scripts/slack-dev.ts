import { loadEnvConfig } from "@next/env";
import { App, LogLevel } from "@slack/bolt";
import { appendActionResult, SLACK_ACTIONS, type SlackBlock } from "@/lib/slack/blocks";
import { handleSlackAction } from "@/lib/slack/actions";
import { buildJobSearchOsSlackStatus } from "@/lib/slack/status";
import { requireSlackConfig } from "@/lib/slack/config";

loadEnvConfig(process.cwd());

const config = requireSlackConfig();

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  signingSecret: config.signingSecret,
  socketMode: true,
  logLevel: process.env.SLACK_LOG_LEVEL === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
});

app.command("/jso", async ({ command, ack, respond }) => {
  await ack();
  const text = command.text.trim().toLowerCase();
  if (!text || text === "status") {
    try {
      const status = await buildJobSearchOsSlackStatus();
      await respond({ response_type: "ephemeral", text: status.text, blocks: status.blocks });
    } catch (error) {
      await respond({ response_type: "ephemeral", text: errorMessage(error) });
    }
    return;
  }

  await respond({
    response_type: "ephemeral",
    text: "Supported command: /jso status",
  });
});

for (const actionId of Object.values(SLACK_ACTIONS)) {
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
  console.log("[slack] Job Search OS Slack worker is running in Socket Mode.");
}).catch((error) => {
  console.error("[slack] failed to start", error);
  process.exit(1);
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Slack action failed.";
}
