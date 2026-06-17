import { Prisma } from "@prisma/client";
import { applySearchProfileChange, rollbackSearchProfileChange } from "@/lib/agents/recruiting-search-optimization";
import { approveJoleneDelegatedWork } from "@/lib/jolene/chief-of-staff";
import { approveJoleneOperatingLoopActions } from "@/lib/jolene/operating-loop";
import { parseActionValue, SLACK_ACTIONS, type SlackActionPayload } from "@/lib/slack/blocks";
import { getSlackConfig, isSlackCoachUser, isSlackUserAllowed } from "@/lib/slack/config";
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
  const payload = parseActionValue(input.value);
  validateActionKind(input.actionId, payload);
  assertSlackUserCanPerformAction(input.slackUserId, payload);

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

  if (
    payload.kind === "reject_recommendation"
    || payload.kind === "needs_evidence"
    || payload.kind === "discuss_in_thread"
    || payload.kind === "mark_reviewed"
    || payload.kind === "capture_coach_note"
  ) {
    const userId = await resolveSlackV3UserId(payload);
    const message = v3ActionMessage(payload.kind);
    const subject = v3ActionSubject(payload.kind);
    await recordSlackV3Event({
      userId,
      agentRunId: payload.agentRunId ?? null,
      type: `slack_${payload.kind}`,
      message,
      payload: { actionId: input.actionId, slackUserId: input.slackUserId ?? null, ...payload },
    });
    await logSlackAction({
      userId,
      subject,
      body: message,
      status: "executed",
      payload: { actionId: input.actionId, slackUserId: input.slackUserId ?? null, ...payload },
    });
    return { ok: true, message };
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
    reject_recommendation: SLACK_ACTIONS.rejectRecommendation,
    needs_evidence: SLACK_ACTIONS.needsEvidence,
    discuss_in_thread: SLACK_ACTIONS.discussInThread,
    mark_reviewed: SLACK_ACTIONS.markReviewed,
    capture_coach_note: SLACK_ACTIONS.captureCoachNote,
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

function assertSlackUserCanPerformAction(slackUserId: string | null | undefined, payload: SlackActionPayload) {
  if (payload.kind !== "capture_coach_note") {
    assertSlackUserCanMutate(slackUserId);
    return;
  }

  const config = getSlackConfig();
  if (!config.configured) return;
  if (isSlackUserAllowed(slackUserId, config.config) || isSlackCoachUser(slackUserId, config.config)) return;
  throw new Error("This Slack user is not allowed to leave Job Search OS coach notes.");
}

async function resolveSlackV3UserId(payload: Extract<SlackActionPayload, { entityId: string }>) {
  const agentRunId = "agentRunId" in payload ? payload.agentRunId : null;
  if (agentRunId) {
    const run = await prisma.agentRun.findFirst({
      where: { id: agentRunId },
      select: { userId: true },
    });
    if (run?.userId) return run.userId;
  }

  const model = entityLookup[payload.entityType];
  const record = model ? await model(payload.entityId) : null;
  if (record?.userId) return record.userId;

  const fallback = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!fallback) throw new Error("No Job Search OS user was found for this Slack action.");
  return fallback.id;
}

const entityLookup: Record<string, (id: string) => Promise<{ userId: string } | null>> = {
  application: async (id) => prisma.application.findFirst({ where: { id }, select: { userId: true } }),
  linkedin_draft: async (id) => prisma.linkedInPostDraft.findFirst({ where: { id }, select: { userId: true } }),
  interview_prep: async (id) => prisma.interviewPrepTask.findFirst({ where: { id }, select: { userId: true } }),
  follow_up: async (id) => prisma.recruiterOutreach.findFirst({ where: { id }, select: { userId: true } }),
  search_optimization_run: async (id) => {
    const change = await prisma.searchProfileChange.findFirst({ where: { id }, select: { userId: true } });
    if (change) return change;
    return prisma.searchOptimizationRun.findFirst({ where: { id }, select: { userId: true } });
  },
  job: async (id) => {
    const application = await prisma.application.findFirst({ where: { jobPostingId: id }, select: { userId: true }, orderBy: { updatedAt: "desc" } });
    if (application) return application;
    const match = await prisma.jobProfileMatch.findFirst({
      where: { jobPostingId: id },
      select: { jobSearchProfile: { select: { userId: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return match?.jobSearchProfile.userId ? { userId: match.jobSearchProfile.userId } : null;
  },
};

async function recordSlackV3Event(input: {
  userId: string;
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

function v3ActionSubject(kind: string) {
  if (kind === "reject_recommendation") return "Slack rejected recommendation";
  if (kind === "needs_evidence") return "Slack requested more evidence";
  if (kind === "discuss_in_thread") return "Slack opened decision discussion";
  if (kind === "mark_reviewed") return "Slack marked item reviewed";
  return "Slack captured coach note intent";
}

function v3ActionMessage(kind: string) {
  if (kind === "reject_recommendation") return "Slack recorded a rejection of this recommendation. No app state was mutated.";
  if (kind === "needs_evidence") return "Slack recorded a request for more evidence. The app remains the source of truth.";
  if (kind === "discuss_in_thread") return "Slack recorded that this item should be discussed in its operations thread.";
  if (kind === "mark_reviewed") return "Slack recorded that this item was reviewed. No external action was taken.";
  return "Slack recorded coach-note intent. Coach notes are advisory and do not mutate app state.";
}
