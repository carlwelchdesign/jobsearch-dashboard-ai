import {
  actions,
  compactBlocks,
  context,
  header,
  link,
  section,
  slackButton,
  SLACK_ACTIONS,
  actionValue,
  type SlackMessage,
  type SlackRunCommand,
} from "@/lib/slack/blocks";
import { getSlackConfig, isSlackUserAllowed, requireSlackConfig } from "@/lib/slack/config";
import { buildSlackDailyBriefing } from "@/lib/slack/daily";
import { buildSlackApprovalsMessage, buildSlackCommandCenterData, buildSlackRunsMessage } from "@/lib/slack/home";
import { openSlackOpportunityRoom } from "@/lib/slack/opportunity-room";
import { buildJobSearchOsSlackStatus } from "@/lib/slack/status";

export type SlackCommandRoute =
  | { kind: "message"; message: SlackMessage }
  | { kind: "run_modal"; command: SlackRunCommand };

export async function routeJsoCommand(text: string, slackUserId?: string | null): Promise<SlackCommandRoute> {
  const command = normalizeCommand(text);
  if (!command || command === "status") {
    return { kind: "message", message: await buildJobSearchOsSlackStatus() };
  }
  if (command === "approvals") {
    return { kind: "message", message: buildSlackApprovalsMessage(await buildSlackCommandCenterData()) };
  }
  if (command === "runs") {
    return { kind: "message", message: buildSlackRunsMessage(await buildSlackCommandCenterData()) };
  }
  if (command === "morning" || command === "evening" || command === "focus") {
    return { kind: "message", message: await buildSlackDailyBriefing(command) };
  }
  if (command.startsWith("opportunity ")) {
    assertCommandUserCanMutate(slackUserId);
    const rawId = command.slice("opportunity ".length).trim();
    if (!rawId) return { kind: "message", message: buildOpportunityUsageMessage(requireSlackConfig().appBaseUrl) };
    const result = await openSlackOpportunityRoom(rawId);
    return { kind: "message", message: result.message };
  }
  if (command === "coach summary") {
    return { kind: "message", message: buildCoachSummaryMessage(await buildSlackCommandCenterData()) };
  }
  if (command === "help") {
    return { kind: "message", message: buildSlackHelpMessage(requireSlackConfig().appBaseUrl) };
  }

  const runCommand = parseRunCommand(command);
  if (runCommand) return { kind: "run_modal", command: runCommand };

  return { kind: "message", message: buildUnknownCommandMessage(requireSlackConfig().appBaseUrl) };
}

export function buildSlackHelpMessage(appBaseUrl: string): SlackMessage {
  return {
    text: "Job Search OS Slack commands",
    blocks: compactBlocks([
      header("Job Search OS Commands"),
      section([
        "`/jso status` - current operating status",
        "`/jso approvals` - open approval groups",
        "`/jso runs` - recent agent runs and safe starters",
        "`/jso morning` - top opportunities, follow-ups, quality issues, and first move",
        "`/jso evening` - completed actions, blockers, decisions, and tomorrow's first move",
        "`/jso focus` - one recommended operating focus",
        "`/jso opportunity <job id or application id>` - create or reopen an ops thread",
        "`/jso coach summary` - show reviewer guidance and recent decision surface",
        "`/jso run jolene` - confirm a new Chief of Staff brief",
        "`/jso run loop` - confirm a new Operating Loop plan",
        "`/jso run search-team` - confirm a Recruiting Search Team run",
        "`/jso help` - show this command list",
      ].join("\n")),
      actions([
        slackButton({
          text: "Open Command Center",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: appBaseUrl }),
          url: appBaseUrl,
        }),
      ]),
      context([link(appBaseUrl, "Open Job Search OS")]),
    ]),
  };
}

function buildOpportunityUsageMessage(appBaseUrl: string): SlackMessage {
  return {
    text: "Missing opportunity id",
    blocks: compactBlocks([
      header("Missing Opportunity ID"),
      section("Use `/jso opportunity <job id or application id>` to create or reuse an ops thread for a high-value opportunity."),
      context([link(`${appBaseUrl}/jobs`, "Open jobs"), link(`${appBaseUrl}/applications`, "Open applications")]),
    ]),
  };
}

function buildCoachSummaryMessage(data: Awaited<ReturnType<typeof buildSlackCommandCenterData>>): SlackMessage {
  return {
    text: "Job Search OS coach summary",
    blocks: compactBlocks([
      header("Coach Mode"),
      section("Trusted reviewers can leave advisory comments in mapped opportunity threads. Their notes are captured as app-side Slack audit records, but they cannot approve applications, publish LinkedIn posts, send email, or mutate search profiles."),
      section(`*Open approval groups*\n${data.pendingApprovals.length ? data.pendingApprovals.map((group) => `- ${group.label}: ${group.count}`).join("\n") : "- None."}`),
      section(`*Recent decisions*\n${data.decisionLog.length ? data.decisionLog.map((item) => `- ${item.subject} - ${item.status}`).join("\n") : "- No Slack decisions yet."}`),
      actions([
        slackButton({
          text: "Open app",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: data.appBaseUrl }),
          url: data.appBaseUrl,
        }),
      ]),
      context([link(data.appBaseUrl, "Open Job Search OS")]),
    ]),
  };
}

function buildUnknownCommandMessage(appBaseUrl: string): SlackMessage {
  return {
    text: "Unsupported /jso command",
    blocks: compactBlocks([
      header("Unsupported Command"),
      section("Use `/jso help` for the supported Job Search OS commands."),
      context([link(appBaseUrl, "Open Job Search OS")]),
    ]),
  };
}

function parseRunCommand(command: string): SlackRunCommand | null {
  const match = /^run\s+(.+)$/.exec(command);
  if (!match) return null;
  const target = match[1].replace(/\s+/g, "-");
  if (target === "jolene" || target === "chief" || target === "chief-of-staff") return "jolene";
  if (target === "loop" || target === "operating-loop") return "loop";
  if (target === "search-team" || target === "recruiting-search-team") return "search-team";
  if (target === "email-ops" || target === "email") return "email-ops";
  return null;
}

function normalizeCommand(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function assertCommandUserCanMutate(slackUserId: string | null | undefined) {
  const config = getSlackConfig();
  if (config.configured && !isSlackUserAllowed(slackUserId, config.config)) {
    throw new Error("This Slack user is not allowed to start Job Search OS actions.");
  }
}
