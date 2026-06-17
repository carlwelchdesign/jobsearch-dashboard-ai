import { loadEnvConfig } from "@next/env";
import { App, LogLevel } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { View } from "@slack/types";
import { appendActionResult, parseActionValue, SLACK_ACTIONS, type SlackBlock } from "@/lib/slack/blocks";
import { assertSlackUserCanMutate, handleSlackAction } from "@/lib/slack/actions";
import { routeJsoCommand } from "@/lib/slack/commands";
import { requireSlackConfig } from "@/lib/slack/config";
import { buildSlackCommandCenterData, buildSlackHomeView } from "@/lib/slack/home";
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
    const route = await routeJsoCommand(command.text);
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
  console.log("[slack] Job Search OS Slack worker is running in Socket Mode.");
}).catch((error) => {
  console.error("[slack] failed to start", error);
  process.exit(1);
});

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
