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
import { requireSlackConfig } from "@/lib/slack/config";
import { buildSlackApprovalsMessage, buildSlackCommandCenterData, buildSlackRunsMessage } from "@/lib/slack/home";
import { buildJobSearchOsSlackStatus } from "@/lib/slack/status";

export type SlackCommandRoute =
  | { kind: "message"; message: SlackMessage }
  | { kind: "run_modal"; command: SlackRunCommand };

export async function routeJsoCommand(text: string): Promise<SlackCommandRoute> {
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
