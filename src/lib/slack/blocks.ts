import type { Block, KnownBlock } from "@slack/types";
import type { SearchOptimizationSummary } from "@/lib/agents/recruiting-search-optimization";
import type { JoleneChiefOutput } from "@/lib/jolene/chief-of-staff";
import type { JoleneOperatingLoopOutput } from "@/lib/jolene/operating-loop";

export const SLACK_ACTIONS = {
  approveChiefProposal: "jso_approve_chief_proposal",
  approveOperatingLoopProposal: "jso_approve_loop_proposal",
  applySearchProfileChange: "jso_apply_search_profile_change",
  rollbackSearchProfileChange: "jso_rollback_search_profile_change",
  rejectRecommendation: "jso_reject_recommendation",
  needsEvidence: "jso_needs_evidence",
  discussInThread: "jso_discuss_in_thread",
  markReviewed: "jso_mark_reviewed",
  captureCoachNote: "jso_capture_coach_note",
  refreshHome: "jso_refresh_home",
  openRunModal: "jso_open_run_modal",
  openLink: "jso_open_link",
} as const;

export type SlackRunCommand = "jolene" | "loop" | "search-team" | "email-ops";

export type SlackActionPayload =
  | { kind: "chief_proposal"; runId: string; proposalId: string }
  | { kind: "operating_loop_proposal"; runId: string; proposalId: string }
  | { kind: "apply_search_profile_change"; changeId: string }
  | { kind: "rollback_search_profile_change"; changeId: string }
  | SlackV3ActionPayload
  | { kind: "refresh_home" }
  | { kind: "open_run_modal"; command: SlackRunCommand }
  | { kind: "open_link"; href: string };

export type SlackV3EntityType = "job" | "application" | "linkedin_draft" | "interview_prep" | "follow_up" | "search_optimization_run";

export type SlackV3ActionPayload = {
  kind: "reject_recommendation" | "needs_evidence" | "discuss_in_thread" | "mark_reviewed" | "capture_coach_note";
  entityType: SlackV3EntityType;
  entityId: string;
  agentRunId?: string | null;
  threadId?: string | null;
  href?: string | null;
  label?: string | null;
};

export type SlackBlock = KnownBlock | Block;

export type SlackMessage = {
  text: string;
  blocks: SlackBlock[];
};

export type SlackStatusSummary = {
  generatedAt: Date;
  appBaseUrl: string;
  latestChiefRun: { id: string; status: string; updatedAt: Date } | null;
  latestOperatingLoopRun: { id: string; status: string; updatedAt: Date } | null;
  latestSearchOptimizationRun: { id: string; status: string; createdAt: Date; summary: string } | null;
  openSearchProfileChanges: number;
  readyApplications: number;
  needsReviewJobs: number;
};

export function buildJoleneChiefOpsMessage(input: {
  runId: string;
  output: JoleneChiefOutput;
  appBaseUrl: string;
}): SlackMessage {
  const topPriorities = input.output.priorities.slice(0, 3).map((priority) => `- ${sanitize(priority.title)} (${priority.category})`);
  return {
    text: `Jolene Chief of Staff brief: ${input.output.summary}`,
    blocks: compactBlocks([
      header("Jolene Chief of Staff"),
      section(`*Summary:* ${sanitize(input.output.summary)}`),
      topPriorities.length ? section(`*Top priorities*\n${topPriorities.join("\n")}`) : null,
      section(`*Delegated proposals:* ${input.output.delegatedWork.length}\n*Confidence:* ${input.output.confidence}`),
      context([link(input.appBaseUrl, "Open Job Search OS"), `Run ${input.runId}`]),
    ]),
  };
}

export function buildJoleneChiefApprovalMessage(input: {
  runId: string;
  output: JoleneChiefOutput;
  appBaseUrl: string;
}): SlackMessage | null {
  const requests = input.output.approvalRequests.slice(0, 8);
  if (!requests.length) return null;

  return {
    text: `Jolene has ${requests.length} delegated proposal(s) awaiting approval.`,
    blocks: compactBlocks([
      header("Jolene Approvals"),
      section(`Jolene has *${requests.length}* internal proposal(s) awaiting review. The app remains the source of truth.`),
      ...requests.flatMap((request) => [
        section(`*${sanitize(request.label)}*\n${sanitize(request.reason)}`),
        actions([
          slackButton({
            text: "Approve",
            actionId: SLACK_ACTIONS.approveChiefProposal,
            value: actionValue({ kind: "chief_proposal", runId: input.runId, proposalId: request.proposalId }),
            style: "primary",
          }),
          slackButton({
            text: "Reject",
            actionId: SLACK_ACTIONS.rejectRecommendation,
            value: actionValue({ kind: "reject_recommendation", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, label: request.label }),
            style: "danger",
          }),
          slackButton({
            text: "Needs evidence",
            actionId: SLACK_ACTIONS.needsEvidence,
            value: actionValue({ kind: "needs_evidence", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, label: request.label }),
          }),
          slackButton({
            text: "Discuss",
            actionId: SLACK_ACTIONS.discussInThread,
            value: actionValue({ kind: "discuss_in_thread", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, href: input.appBaseUrl, label: request.label }),
          }),
          slackButton({
            text: "Open app",
            actionId: SLACK_ACTIONS.openLink,
            value: actionValue({ kind: "open_link", href: input.appBaseUrl }),
            url: input.appBaseUrl,
          }),
        ]),
      ]),
      context([link(input.appBaseUrl, "Open app"), `Run ${input.runId}`]),
    ]),
  };
}

export function buildOperatingLoopOpsMessage(input: {
  runId: string;
  output: JoleneOperatingLoopOutput;
  appBaseUrl: string;
}): SlackMessage {
  const signals = input.output.signalSummary.slice(0, 4).map((signal) => `- ${sanitize(signal)}`);
  return {
    text: `Jolene Operating Loop planned ${input.output.recommendedActions.length} action(s).`,
    blocks: compactBlocks([
      header("Jolene Operating Loop"),
      section(`*Summary:* ${sanitize(input.output.summary)}`),
      signals.length ? section(`*Signals*\n${signals.join("\n")}`) : null,
      section(`*Proposed actions:* ${input.output.recommendedActions.length}\n*Skipped actions:* ${input.output.skippedActions.length}`),
      context([link(input.appBaseUrl, "Open Job Search OS"), `Run ${input.runId}`]),
    ]),
  };
}

export function buildOperatingLoopApprovalMessage(input: {
  runId: string;
  output: JoleneOperatingLoopOutput;
  appBaseUrl: string;
}): SlackMessage | null {
  const requests = input.output.approvalRequests.slice(0, 8);
  if (!requests.length) return null;

  return {
    text: `Jolene Operating Loop has ${requests.length} proposal(s) awaiting approval.`,
    blocks: compactBlocks([
      header("Operating Loop Approvals"),
      section(`Review *${requests.length}* proposed internal action(s). Slack can approve them, but execution is still recorded in the app.`),
      ...requests.flatMap((request) => [
        section(`*${sanitize(request.label)}*\n${sanitize(request.reason)}`),
        actions([
          slackButton({
            text: "Approve",
            actionId: SLACK_ACTIONS.approveOperatingLoopProposal,
            value: actionValue({ kind: "operating_loop_proposal", runId: input.runId, proposalId: request.proposalId }),
            style: "primary",
          }),
          slackButton({
            text: "Reject",
            actionId: SLACK_ACTIONS.rejectRecommendation,
            value: actionValue({ kind: "reject_recommendation", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, label: request.label }),
            style: "danger",
          }),
          slackButton({
            text: "Needs evidence",
            actionId: SLACK_ACTIONS.needsEvidence,
            value: actionValue({ kind: "needs_evidence", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, label: request.label }),
          }),
          slackButton({
            text: "Discuss",
            actionId: SLACK_ACTIONS.discussInThread,
            value: actionValue({ kind: "discuss_in_thread", entityType: "search_optimization_run", entityId: request.proposalId, agentRunId: input.runId, href: input.appBaseUrl, label: request.label }),
          }),
          slackButton({
            text: "Open app",
            actionId: SLACK_ACTIONS.openLink,
            value: actionValue({ kind: "open_link", href: input.appBaseUrl }),
            url: input.appBaseUrl,
          }),
        ]),
      ]),
      context([link(input.appBaseUrl, "Open app"), `Run ${input.runId}`]),
    ]),
  };
}

export function buildSearchOptimizationOpsMessage(input: {
  summary: SearchOptimizationSummary;
  appBaseUrl: string;
}): SlackMessage {
  const changes = input.summary.changes.slice(0, 5).map((change) => `- ${sanitize(change.profileName)}: ${change.action} (${change.status})`);
  return {
    text: `Recruiting Search Team completed: ${input.summary.summary}`,
    blocks: compactBlocks([
      header("Recruiting Search Team"),
      section(`*Summary:* ${sanitize(input.summary.summary)}`),
      section(`*Qualified yield:* ${Math.round(input.summary.qualifiedYield * 100)}%\n*Run quality:* ${sanitize(input.summary.runQualityLabel)}\n*Changes:* ${input.summary.changes.length}`),
      changes.length ? section(`*Profile changes*\n${changes.join("\n")}`) : null,
      context([link(`${input.appBaseUrl}/profiles`, "Open profiles"), `Run ${input.summary.agentRunId}`]),
    ]),
  };
}

export function buildSearchOptimizationApprovalMessage(input: {
  summary: SearchOptimizationSummary;
  appBaseUrl: string;
}): SlackMessage | null {
  const actionable = input.summary.changes.filter((change) =>
    (change.riskLevel === "LOW" && change.status !== "APPLIED" && change.status !== "ROLLED_BACK") || change.status === "APPLIED",
  ).slice(0, 8);
  if (!actionable.length) return null;

  return {
    text: `Recruiting Search Team has ${actionable.length} search profile action(s) available.`,
    blocks: compactBlocks([
      header("Search Profile Actions"),
      section("Review low-risk search-profile edits. High-risk structural changes stay review-only in the app."),
      ...actionable.flatMap((change) => [
        section(`*${sanitize(change.profileName)}*\n${change.action} - ${change.status}\n${sanitize(change.rationale)}`),
        actions([
          change.status === "APPLIED"
            ? slackButton({
                text: "Rollback",
                actionId: SLACK_ACTIONS.rollbackSearchProfileChange,
                value: actionValue({ kind: "rollback_search_profile_change", changeId: change.id }),
              })
            : slackButton({
                text: "Apply",
                actionId: SLACK_ACTIONS.applySearchProfileChange,
                value: actionValue({ kind: "apply_search_profile_change", changeId: change.id }),
                style: "primary",
              }),
          slackButton({
            text: "Needs evidence",
            actionId: SLACK_ACTIONS.needsEvidence,
            value: actionValue({ kind: "needs_evidence", entityType: "search_optimization_run", entityId: change.id, agentRunId: input.summary.agentRunId, label: change.profileName }),
          }),
          slackButton({
            text: "Discuss",
            actionId: SLACK_ACTIONS.discussInThread,
            value: actionValue({ kind: "discuss_in_thread", entityType: "search_optimization_run", entityId: change.id, agentRunId: input.summary.agentRunId, href: `${input.appBaseUrl}/profiles`, label: change.profileName }),
          }),
          slackButton({
            text: "Open profiles",
            actionId: SLACK_ACTIONS.openLink,
            value: actionValue({ kind: "open_link", href: `${input.appBaseUrl}/profiles` }),
            url: `${input.appBaseUrl}/profiles`,
          }),
        ]),
      ]),
      context([link(`${input.appBaseUrl}/profiles`, "Open profiles"), `Optimization ${input.summary.optimizationRunId}`]),
    ]),
  };
}

export function buildStatusMessage(status: SlackStatusSummary): SlackMessage {
  return {
    text: "Job Search OS status",
    blocks: compactBlocks([
      header("Job Search OS Status"),
      section([
        `*Ready applications:* ${status.readyApplications}`,
        `*Jobs needing review:* ${status.needsReviewJobs}`,
        `*Open search profile changes:* ${status.openSearchProfileChanges}`,
      ].join("\n")),
      section([
        `*Latest Chief brief:* ${formatRun(status.latestChiefRun)}`,
        `*Latest Operating Loop:* ${formatRun(status.latestOperatingLoopRun)}`,
        `*Latest Search Optimization:* ${status.latestSearchOptimizationRun ? `${status.latestSearchOptimizationRun.status} (${shortDate(status.latestSearchOptimizationRun.createdAt)})` : "none"}`,
      ].join("\n")),
      status.latestSearchOptimizationRun ? section(`*Last search note:* ${sanitize(status.latestSearchOptimizationRun.summary)}`) : null,
      context([link(status.appBaseUrl, "Open Job Search OS"), `Generated ${shortDate(status.generatedAt)}`]),
    ]),
  };
}

export function actionValue(payload: SlackActionPayload) {
  return JSON.stringify(payload);
}

export function parseActionValue(value: string): SlackActionPayload {
  const parsed = JSON.parse(value) as SlackActionPayload;
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    throw new Error("Slack action payload is invalid.");
  }
  return parsed;
}

export function appendActionResult(blocks: SlackBlock[] | undefined, message: string, ok: boolean): SlackBlock[] {
  const existing = (blocks ?? []).filter((block) => !("block_id" in block) || block.block_id !== "jso_action_result");
  return [
    ...existing,
    {
      type: "context",
      block_id: "jso_action_result",
      elements: [{ type: "mrkdwn", text: `${ok ? "*Done:*" : "*Failed:*"} ${sanitize(message)}` }],
    },
  ];
}

export function header(text: string): SlackBlock {
  return { type: "header", text: { type: "plain_text", text: truncate(text, 150), emoji: false } };
}

export function section(text: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text: truncate(text, 2800) } };
}

export function context(items: string[]): SlackBlock {
  return { type: "context", elements: items.map((item) => ({ type: "mrkdwn", text: truncate(item, 300) })) };
}

export function actions(elements: SlackBlockElement[]): SlackBlock {
  return { type: "actions", elements };
}

export type SlackBlockElement = {
  type: "button";
  text: { type: "plain_text"; text: string; emoji: false };
  action_id: string;
  value?: string;
  url?: string;
  style?: "primary" | "danger";
};

export function slackButton(input: {
  text: string;
  actionId: string;
  value?: string;
  url?: string;
  style?: "primary" | "danger";
}): SlackBlockElement {
  return {
    type: "button",
    text: { type: "plain_text", text: truncate(input.text, 75), emoji: false },
    action_id: input.actionId,
    ...(input.value ? { value: input.value } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.style ? { style: input.style } : {}),
  };
}

export function link(url: string, label: string) {
  return `<${url}|${label}>`;
}

export function sanitize(value: string | null | undefined) {
  return truncate((value ?? "").replace(/[<>&]/g, (char) => ({ "<": "‹", ">": "›", "&": "and" }[char] ?? char)), 600);
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

export function compactBlocks(blocks: Array<SlackBlock | null>): SlackBlock[] {
  return blocks.filter(Boolean) as SlackBlock[];
}

function formatRun(run: { status: string; updatedAt: Date } | null) {
  return run ? `${run.status} (${shortDate(run.updatedAt)})` : "none";
}

export function shortDate(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 16);
}
