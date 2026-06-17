import { Prisma } from "@prisma/client";
import { applySearchProfileChange, rollbackSearchProfileChange } from "@/lib/agents/recruiting-search-optimization";
import { approveJoleneDelegatedWork } from "@/lib/jolene/chief-of-staff";
import { approveJoleneOperatingLoopActions } from "@/lib/jolene/operating-loop";
import { parseActionValue, SLACK_ACTIONS, type SlackActionPayload } from "@/lib/slack/blocks";
import { getSlackConfig, isSlackUserAllowed } from "@/lib/slack/config";
import { logSlackAction } from "@/lib/slack/post";
import { prisma } from "@/lib/prisma";

export type HandleSlackActionInput = {
  actionId: string;
  value: string;
  slackUserId?: string | null;
};

export type HandleSlackActionResult = {
  ok: boolean;
  message: string;
};

export function assertSlackUserCanMutate(slackUserId: string | null | undefined) {
  const config = getSlackConfig();
  if (config.configured && !isSlackUserAllowed(slackUserId, config.config)) {
    throw new Error("This Slack user is not allowed to approve Job Search OS actions.");
  }
}

export async function handleSlackAction(input: HandleSlackActionInput): Promise<HandleSlackActionResult> {
  assertSlackUserCanMutate(input.slackUserId);

  const payload = parseActionValue(input.value);
  validateActionKind(input.actionId, payload);

  if (payload.kind === "chief_proposal") {
    const userId = await findAgentRunOwner(payload.runId, "JOLENE_CHIEF_OF_STAFF", "Jolene Chief of Staff run");
    const result = await approveJoleneDelegatedWork({
      userId,
      runId: payload.runId,
      proposalIds: [payload.proposalId],
    });
    await logSlackAction({
      userId,
      subject: "Slack approved Jolene delegated work",
      body: result.message,
      status: "executed",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, ...payload },
    });
    return { ok: true, message: result.message };
  }

  if (payload.kind === "operating_loop_proposal") {
    const userId = await findAgentRunOwner(payload.runId, "JOLENE_OPERATING_LOOP", "Jolene Operating Loop run");
    const result = await approveJoleneOperatingLoopActions({
      userId,
      runId: payload.runId,
      proposalIds: [payload.proposalId],
    });
    await logSlackAction({
      userId,
      subject: "Slack approved Jolene Operating Loop action",
      body: result.message,
      status: "executed",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, ...payload },
    });
    return { ok: true, message: result.message };
  }

  if (payload.kind === "apply_search_profile_change") {
    const change = await prisma.searchProfileChange.findFirst({
      where: { id: payload.changeId },
      select: { id: true, userId: true, riskLevel: true, status: true, agentRunId: true },
    });
    if (!change) throw new Error("Search profile change was not found.");
    if (change.riskLevel !== "LOW") throw new Error("Only low-risk search profile changes can be applied from Slack.");
    if (change.status === "APPLIED") return { ok: true, message: "Search profile change was already applied." };

    const applied = await applySearchProfileChange(change.id);
    await recordSearchProfileSlackEvent({
      agentRunId: change.agentRunId,
      type: "slack_search_profile_change_applied",
      message: "Slack applied a low-risk search profile change.",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, changeId: applied.id, previousStatus: change.status },
    });
    await logSlackAction({
      userId: change.userId,
      subject: "Slack applied search profile change",
      body: "Slack applied a low-risk search profile change.",
      status: "executed",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, ...payload },
    });
    return { ok: true, message: "Search profile change applied." };
  }

  if (payload.kind === "rollback_search_profile_change") {
    const change = await prisma.searchProfileChange.findFirst({
      where: { id: payload.changeId },
      select: { id: true, userId: true, status: true, agentRunId: true },
    });
    if (!change) throw new Error("Search profile change was not found.");
    if (change.status !== "APPLIED") throw new Error("Only applied search profile changes can be rolled back from Slack.");

    const rolledBack = await rollbackSearchProfileChange(change.id);
    await recordSearchProfileSlackEvent({
      agentRunId: change.agentRunId,
      type: "slack_search_profile_change_rolled_back",
      message: "Slack rolled back a search profile change.",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, changeId: rolledBack.id },
    });
    await logSlackAction({
      userId: change.userId,
      subject: "Slack rolled back search profile change",
      body: "Slack rolled back a search profile change.",
      status: "executed",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId, ...payload },
    });
    return { ok: true, message: "Search profile change rolled back." };
  }

  throw new Error("Unsupported Slack action.");
}

async function findAgentRunOwner(runId: string, agentType: "JOLENE_CHIEF_OF_STAFF" | "JOLENE_OPERATING_LOOP", label: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, agentType, status: "COMPLETED" },
    select: { userId: true },
  });
  if (!run?.userId) throw new Error(`${label} not found.`);
  return run.userId;
}

function validateActionKind(actionId: string, payload: SlackActionPayload) {
  const expectedActionId = {
    chief_proposal: SLACK_ACTIONS.approveChiefProposal,
    operating_loop_proposal: SLACK_ACTIONS.approveOperatingLoopProposal,
    apply_search_profile_change: SLACK_ACTIONS.applySearchProfileChange,
    rollback_search_profile_change: SLACK_ACTIONS.rollbackSearchProfileChange,
    refresh_home: null,
    open_run_modal: null,
    open_link: null,
  }[payload.kind];
  if (!expectedActionId) throw new Error("Unsupported Slack action.");
  if (actionId !== expectedActionId) {
    throw new Error("Slack action id does not match its payload.");
  }
}

async function recordSearchProfileSlackEvent(input: {
  agentRunId: string | null;
  type: string;
  message: string;
  payload: Record<string, unknown>;
}) {
  if (!input.agentRunId) return null;
  return prisma.agentRunEvent.create({
    data: {
      agentRunId: input.agentRunId,
      type: input.type,
      message: input.message,
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
  });
}
