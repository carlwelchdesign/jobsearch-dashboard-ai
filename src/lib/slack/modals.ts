import type { Prisma } from "@prisma/client";
import { runRecruitingSearchOptimization } from "@/lib/agents/recruiting-search-optimization";
import { requireSingleUser } from "@/lib/auth/single-user";
import { runJoleneChiefOfStaffAgent } from "@/lib/jolene/chief-of-staff";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";
import { assertSlackUserCanMutate } from "@/lib/slack/actions";
import {
  compactBlocks,
  context,
  link,
  sanitize,
  section,
  type SlackBlock,
  type SlackRunCommand,
} from "@/lib/slack/blocks";
import { requireSlackConfig } from "@/lib/slack/config";
import { logSlackAction } from "@/lib/slack/post";
import { prisma } from "@/lib/prisma";

export const SLACK_VIEW_CALLBACKS = {
  runInternal: "jso_run_internal_confirm",
} as const;

export type SlackModalView = {
  type: "modal";
  callback_id: string;
  private_metadata: string;
  title: { type: "plain_text"; text: string; emoji: false };
  submit?: { type: "plain_text"; text: string; emoji: false };
  close?: { type: "plain_text"; text: string; emoji: false };
  blocks: SlackBlock[];
};

export type SlackRunModalMetadata = {
  kind: "run_internal";
  command: SlackRunCommand;
};

export type SlackRunSubmissionResult = {
  runId: string;
  message: string;
  href: string;
};

export function buildRunConfirmationModal(command: SlackRunCommand): SlackModalView {
  const detail = runCommandDetail(command);
  return {
    type: "modal",
    callback_id: SLACK_VIEW_CALLBACKS.runInternal,
    private_metadata: JSON.stringify({ kind: "run_internal", command } satisfies SlackRunModalMetadata),
    title: plainText("Confirm internal run"),
    submit: plainText("Start run"),
    close: plainText("Cancel"),
    blocks: compactBlocks([
      section(`*${detail.label}*\n${detail.description}`),
      section(`*What Slack will do*\n${detail.willDo}`),
      section("*What Slack will not do*\nSlack will not submit applications, send email, publish LinkedIn posts, contact employers, or mutate external calendars."),
      context([`Recorded in Job Search OS as ${detail.auditLabel}.`]),
    ]),
  };
}

export function buildRunAcceptedModal(command: SlackRunCommand): SlackModalView {
  const detail = runCommandDetail(command);
  return {
    type: "modal",
    callback_id: SLACK_VIEW_CALLBACKS.runInternal,
    private_metadata: JSON.stringify({ kind: "run_internal", command } satisfies SlackRunModalMetadata),
    title: plainText("Run accepted"),
    close: plainText("Close"),
    blocks: compactBlocks([
      section(`*${detail.label}* has been accepted and is running inside Job Search OS.`),
      section("Slack will refresh the Home tab when the run finishes. The app remains the source of truth."),
      context([link(`${requireSlackConfig().appBaseUrl}${detail.href}`, "Open in app")]),
    ]),
  };
}

export function buildRunFailedModal(command: SlackRunCommand, message: string): SlackModalView {
  const detail = runCommandDetail(command);
  return {
    type: "modal",
    callback_id: SLACK_VIEW_CALLBACKS.runInternal,
    private_metadata: JSON.stringify({ kind: "run_internal", command } satisfies SlackRunModalMetadata),
    title: plainText("Run failed"),
    close: plainText("Close"),
    blocks: compactBlocks([
      section(`*${detail.label}* could not be started from Slack.`),
      section(sanitize(message)),
      context([link(`${requireSlackConfig().appBaseUrl}${detail.href}`, "Open in app")]),
    ]),
  };
}

export function parseRunModalMetadata(value: string | undefined): SlackRunModalMetadata {
  const parsed = JSON.parse(value || "{}") as SlackRunModalMetadata;
  if (parsed.kind !== "run_internal" || !isRunCommand(parsed.command)) {
    throw new Error("Slack run modal metadata is invalid.");
  }
  return parsed;
}

export async function handleSlackRunModalSubmission(input: {
  command: SlackRunCommand;
  slackUserId?: string | null;
}): Promise<SlackRunSubmissionResult> {
  assertSlackUserCanMutate(input.slackUserId);
  const user = await requireSingleUser();
  const detail = runCommandDetail(input.command);

  try {
    const result = await executeRunCommand(input.command, user.id);
    await prisma.agentRunEvent.create({
      data: {
        agentRunId: result.runId,
        type: "slack_internal_run_started",
        message: `Slack started ${detail.label}.`,
        payloadJson: {
          command: input.command,
          slackUserId: input.slackUserId ?? null,
          href: result.href,
        } as Prisma.InputJsonValue,
      },
    });
    await logSlackAction({
      userId: user.id,
      subject: `Slack started ${detail.label}`,
      body: result.message,
      status: "executed",
      payload: { command: input.command, slackUserId: input.slackUserId ?? null, runId: result.runId },
    });
    return result;
  } catch (error) {
    await logSlackAction({
      userId: user.id,
      subject: `Slack failed to start ${detail.label}`,
      body: error instanceof Error ? error.message : "Slack internal run failed.",
      status: "failed",
      payload: { command: input.command, slackUserId: input.slackUserId ?? null },
    });
    throw error;
  }
}

function runCommandDetail(command: SlackRunCommand) {
  const appBaseUrl = requireSlackConfig().appBaseUrl;
  const details: Record<SlackRunCommand, {
    label: string;
    description: string;
    willDo: string;
    auditLabel: string;
    href: string;
    absoluteHref: string;
  }> = {
    jolene: {
      label: "Jolene Chief of Staff brief",
      description: "Jolene will inspect current blockers, pipeline state, agent health, Email Ops, market signals, and content signals.",
      willDo: "Create a new internal Chief of Staff agent run and post any approval cards generated by the existing service.",
      auditLabel: "a JOLENE_CHIEF_OF_STAFF AgentRun",
      href: "/dashboard",
      absoluteHref: `${appBaseUrl}/dashboard`,
    },
    loop: {
      label: "Jolene Operating Loop",
      description: "Jolene will refresh the Chief brief and propose internal child-agent work for approval.",
      willDo: "Create a new internal Operating Loop agent run. Proposed work still requires explicit approval.",
      auditLabel: "a JOLENE_OPERATING_LOOP AgentRun",
      href: "/dashboard",
      absoluteHref: `${appBaseUrl}/dashboard`,
    },
    "search-team": {
      label: "Recruiting Search Team",
      description: "The recruiting search team will diagnose Qualified yield and prepare bounded search-profile changes.",
      willDo: "Create a new internal recruiting search optimization run. Low-risk changes follow existing gates; structural changes remain review-only.",
      auditLabel: "a RECRUITING_SEARCH_DIRECTOR AgentRun",
      href: "/profiles",
      absoluteHref: `${appBaseUrl}/profiles`,
    },
    "email-ops": {
      label: "Jolene Email Operations",
      description: "Email Ops will scan configured job-response mail and create in-app findings or calendar drafts for review.",
      willDo: "Create a new internal Email Ops run. Calendar and reply work remains in-app and approval-gated.",
      auditLabel: "a JOLENE_EMAIL_OPERATIONS AgentRun",
      href: "/dashboard/email-ops",
      absoluteHref: `${appBaseUrl}/dashboard/email-ops`,
    },
  };
  return details[command];
}

async function executeRunCommand(command: SlackRunCommand, userId: string): Promise<SlackRunSubmissionResult> {
  const detail = runCommandDetail(command);
  if (command === "jolene") {
    const result = await runJoleneChiefOfStaffAgent({ userId, source: "chat" });
    return {
      runId: result.run.id,
      href: detail.absoluteHref,
      message: `Jolene created ${result.output.priorities.length} priorit${result.output.priorities.length === 1 ? "y" : "ies"} and ${result.output.approvalRequests.length} approval request(s).`,
    };
  }
  if (command === "loop") {
    const result = await runJoleneOperatingLoopAgent({ userId, source: "chat" });
    return {
      runId: result.run.id,
      href: detail.absoluteHref,
      message: `Jolene Operating Loop proposed ${result.output.recommendedActions.length} internal action(s).`,
    };
  }
  if (command === "search-team") {
    const result = await runRecruitingSearchOptimization({ userId, mode: "active" });
    return {
      runId: result.run.id,
      href: detail.absoluteHref,
      message: `Recruiting Search Team prepared ${result.output.changes.length} profile change(s).`,
    };
  }

  const result = await runJoleneEmailOperationsAgent({ userId, source: "chat" });
  return {
    runId: result.run.id,
    href: detail.absoluteHref,
    message: `Email Ops reviewed ${result.output.scanned} message(s), created ${result.output.findingsCreated} finding(s), and drafted ${result.output.calendarDrafts} calendar item(s).`,
  };
}

function isRunCommand(value: unknown): value is SlackRunCommand {
  return value === "jolene" || value === "loop" || value === "search-team" || value === "email-ops";
}

function plainText(text: string) {
  return { type: "plain_text" as const, text, emoji: false as const };
}
