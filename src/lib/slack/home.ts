import type { AgentRunStatus, AgentType, Prisma } from "@prisma/client";
import { requireSingleUser } from "@/lib/auth/single-user";
import { getLatestEmailOpsSummary } from "@/lib/jolene/email-ops";
import {
  actionValue,
  actions,
  compactBlocks,
  context,
  header,
  link,
  sanitize,
  section,
  shortDate,
  slackButton,
  SLACK_ACTIONS,
  type SlackBlock,
  type SlackMessage,
  type SlackRunCommand,
} from "@/lib/slack/blocks";
import { requireSlackConfig } from "@/lib/slack/config";
import { prisma } from "@/lib/prisma";

export type SlackHomeView = {
  type: "home";
  blocks: SlackBlock[];
};

export type SlackCommandCenterRun = {
  id: string;
  agentType: AgentType;
  status: AgentRunStatus;
  updatedAt: Date;
  summary: string | null;
  href: string;
};

export type SlackPendingApprovalGroup = {
  label: string;
  count: number;
  href: string;
  detail: string;
};

export type SlackDecisionLogItem = {
  subject: string;
  status: string;
  createdAt: Date;
};

export type SlackCommandCenterData = {
  generatedAt: Date;
  appBaseUrl: string;
  readyApplications: number;
  needsReviewJobs: number;
  openSearchProfileChanges: number;
  unhealthyAgentRuns: number;
  pendingApprovals: SlackPendingApprovalGroup[];
  latestRuns: SlackCommandCenterRun[];
  decisionLog: SlackDecisionLogItem[];
};

const RUN_COMMANDS: Array<{ command: SlackRunCommand; label: string }> = [
  { command: "jolene", label: "Run Jolene brief" },
  { command: "loop", label: "Run Operating Loop" },
  { command: "search-team", label: "Run Search Team" },
  { command: "email-ops", label: "Run Email Ops" },
];

export async function buildSlackCommandCenterData(): Promise<SlackCommandCenterData> {
  const [config, user] = [requireSlackConfig(), await requireSingleUser()];
  const staleThreshold = new Date(Date.now() - 60 * 60 * 1000);
  const [
    latestChiefRun,
    latestOperatingLoopRun,
    openSearchProfileChanges,
    readyApplications,
    needsReviewJobs,
    unhealthyAgentRuns,
    latestRuns,
    searchProfileChanges,
    decisionLog,
    emailOps,
  ] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { userId: user.id, agentType: "JOLENE_CHIEF_OF_STAFF", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, outputJson: true },
    }),
    prisma.agentRun.findFirst({
      where: { userId: user.id, agentType: "JOLENE_OPERATING_LOOP", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, outputJson: true },
    }),
    prisma.searchProfileChange.count({
      where: { userId: user.id, status: { in: ["PROPOSED", "REVIEW_ONLY"] } },
    }),
    prisma.application.count({
      where: { userId: user.id, status: "ready_to_apply", resumeId: { not: null }, coverLetterId: { not: null } },
    }),
    prisma.jobProfileMatch.count({
      where: { status: "needs_review", jobSearchProfile: { userId: user.id } },
    }),
    prisma.agentRun.count({
      where: {
        userId: user.id,
        OR: [
          { status: "FAILED" },
          { status: "RUNNING", updatedAt: { lt: staleThreshold } },
        ],
      },
    }),
    prisma.agentRun.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, agentType: true, status: true, updatedAt: true, outputJson: true, error: true },
    }),
    prisma.searchProfileChange.findMany({
      where: { userId: user.id, status: { in: ["PROPOSED", "REVIEW_ONLY"] } },
      include: { searchProfile: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.notificationLog.findMany({
      where: { userId: user.id, type: "slack", status: { in: ["executed", "failed", "skipped"] } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { subject: true, status: true, createdAt: true },
    }),
    getLatestEmailOpsSummary(user.id).catch(() => null),
  ]);

  const chiefApprovals = approvalRequests(latestChiefRun?.outputJson).length;
  const loopApprovals = approvalRequests(latestOperatingLoopRun?.outputJson).length;
  const emailApprovalCount = emailOps?.findings.filter((finding) => finding.status === "NEEDS_APPROVAL").length ?? 0;
  const calendarDraftCount = emailOps?.pendingCalendarProposals.length ?? 0;

  return {
    generatedAt: new Date(),
    appBaseUrl: config.appBaseUrl,
    readyApplications,
    needsReviewJobs,
    openSearchProfileChanges,
    unhealthyAgentRuns,
    pendingApprovals: compactApprovalGroups([
      {
        label: "Jolene Chief",
        count: chiefApprovals,
        href: `${config.appBaseUrl}/dashboard`,
        detail: `${chiefApprovals} delegated proposal(s) waiting for approval.`,
      },
      {
        label: "Operating Loop",
        count: loopApprovals,
        href: `${config.appBaseUrl}/dashboard`,
        detail: `${loopApprovals} proposed internal action(s) waiting for approval.`,
      },
      {
        label: "Recruiting Search Team",
        count: searchProfileChanges.length,
        href: `${config.appBaseUrl}/profiles`,
        detail: searchProfileChanges.length
          ? searchProfileChanges.slice(0, 3).map((change) => `${change.searchProfile.name}: ${change.action}`).join("; ")
          : "No open search-profile changes.",
      },
      {
        label: "Email Ops",
        count: emailApprovalCount + calendarDraftCount,
        href: `${config.appBaseUrl}/dashboard/email-ops`,
        detail: `${emailApprovalCount} finding(s), ${calendarDraftCount} calendar draft(s).`,
      },
    ]),
    latestRuns: latestRuns.map((run) => ({
      id: run.id,
      agentType: run.agentType,
      status: run.status,
      updatedAt: run.updatedAt,
      summary: run.error ?? summaryFromJson(run.outputJson),
      href: `${config.appBaseUrl}/agents`,
    })),
    decisionLog,
  };
}

export function buildSlackHomeView(data: SlackCommandCenterData): SlackHomeView {
  return {
    type: "home",
    blocks: compactBlocks([
      header("Job Search OS Command Center"),
      section([
        `*Ready applications:* ${data.readyApplications}`,
        `*Jobs needing review:* ${data.needsReviewJobs}`,
        `*Open profile changes:* ${data.openSearchProfileChanges}`,
        `*Agent health items:* ${data.unhealthyAgentRuns}`,
      ].join("\n")),
      actions([
        slackButton({
          text: "Refresh",
          actionId: SLACK_ACTIONS.refreshHome,
          value: actionValue({ kind: "refresh_home" }),
          style: "primary",
        }),
        slackButton({
          text: "Open app",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: data.appBaseUrl }),
          url: data.appBaseUrl,
        }),
      ]),
      section("*Start internal work*"),
      actions(RUN_COMMANDS.map((command) => slackButton({
        text: command.label,
        actionId: SLACK_ACTIONS.openRunModal,
        value: actionValue({ kind: "open_run_modal", command: command.command }),
      }))),
      section(`*Pending approvals*\n${approvalLines(data)}`),
      section(`*Latest runs*\n${runLines(data)}`),
      data.decisionLog.length ? section(`*Recent Slack decisions*\n${decisionLines(data)}`) : null,
      context([link(data.appBaseUrl, "Open Job Search OS"), `Generated ${shortDate(data.generatedAt)}`]),
    ]),
  };
}

export function buildSlackApprovalsMessage(data: SlackCommandCenterData): SlackMessage {
  return {
    text: "Job Search OS approvals",
    blocks: compactBlocks([
      header("Job Search OS Approvals"),
      section(approvalLines(data)),
      actions([
        slackButton({
          text: "Refresh Home",
          actionId: SLACK_ACTIONS.refreshHome,
          value: actionValue({ kind: "refresh_home" }),
          style: "primary",
        }),
        slackButton({
          text: "Open app",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: data.appBaseUrl }),
          url: data.appBaseUrl,
        }),
      ]),
      context([link(data.appBaseUrl, "Open Job Search OS"), `Generated ${shortDate(data.generatedAt)}`]),
    ]),
  };
}

export function buildSlackRunsMessage(data: SlackCommandCenterData): SlackMessage {
  return {
    text: "Job Search OS recent runs",
    blocks: compactBlocks([
      header("Recent Agent Runs"),
      section(runLines(data)),
      actions(RUN_COMMANDS.map((command) => slackButton({
        text: command.label,
        actionId: SLACK_ACTIONS.openRunModal,
        value: actionValue({ kind: "open_run_modal", command: command.command }),
      }))),
      context([link(`${data.appBaseUrl}/agents`, "Open agents"), `Generated ${shortDate(data.generatedAt)}`]),
    ]),
  };
}

function approvalLines(data: SlackCommandCenterData) {
  if (!data.pendingApprovals.length) return "No Slack-actionable approvals are open right now.";
  return data.pendingApprovals
    .map((group) => `*${sanitize(group.label)}:* ${group.count} - ${sanitize(group.detail)} ${link(group.href, "Open")}`)
    .join("\n");
}

function runLines(data: SlackCommandCenterData) {
  if (!data.latestRuns.length) return "No agent runs recorded yet.";
  return data.latestRuns
    .map((run) => `*${run.agentType}:* ${run.status} (${shortDate(run.updatedAt)})${run.summary ? ` - ${sanitize(run.summary)}` : ""}`)
    .join("\n");
}

function decisionLines(data: SlackCommandCenterData) {
  return data.decisionLog
    .map((item) => `*${sanitize(item.status)}:* ${sanitize(item.subject)} (${shortDate(item.createdAt)})`)
    .join("\n");
}

function approvalRequests(value: Prisma.JsonValue | null | undefined) {
  const object = objectValue(value);
  return Array.isArray(object.approvalRequests) ? object.approvalRequests : [];
}

function summaryFromJson(value: Prisma.JsonValue | null | undefined) {
  const object = objectValue(value);
  return typeof object.summary === "string" ? object.summary : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactApprovalGroups(groups: SlackPendingApprovalGroup[]) {
  return groups.filter((group) => group.count > 0);
}
