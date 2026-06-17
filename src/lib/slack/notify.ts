import type { SearchOptimizationSummary } from "@/lib/agents/recruiting-search-optimization";
import type { JoleneChiefOutput } from "@/lib/jolene/chief-of-staff";
import type { JoleneOperatingLoopOutput } from "@/lib/jolene/operating-loop";
import {
  buildJoleneChiefApprovalMessage,
  buildJoleneChiefOpsMessage,
  buildOperatingLoopApprovalMessage,
  buildOperatingLoopOpsMessage,
  buildSearchOptimizationApprovalMessage,
  buildSearchOptimizationOpsMessage,
} from "@/lib/slack/blocks";
import { getSlackConfig } from "@/lib/slack/config";
import { postSlackMessage } from "@/lib/slack/post";

export async function notifySlackJoleneChiefBrief(input: {
  userId: string;
  runId: string;
  output: JoleneChiefOutput;
}) {
  const config = getSlackConfig();
  if (!config.configured) return;

  const opsMessage = buildJoleneChiefOpsMessage({
    runId: input.runId,
    output: input.output,
    appBaseUrl: config.config.appBaseUrl,
  });
  await postSlackMessage({
    userId: input.userId,
    channel: "ops",
    text: opsMessage.text,
    blocks: opsMessage.blocks,
    payload: { source: "jolene_chief_of_staff", runId: input.runId },
  });

  const approvalMessage = buildJoleneChiefApprovalMessage({
    runId: input.runId,
    output: input.output,
    appBaseUrl: config.config.appBaseUrl,
  });
  if (approvalMessage) {
    await postSlackMessage({
      userId: input.userId,
      channel: "approvals",
      text: approvalMessage.text,
      blocks: approvalMessage.blocks,
      payload: { source: "jolene_chief_of_staff", runId: input.runId, approvals: true },
    });
  }
}

export async function notifySlackOperatingLoop(input: {
  userId: string;
  runId: string;
  output: JoleneOperatingLoopOutput;
}) {
  const config = getSlackConfig();
  if (!config.configured) return;

  const opsMessage = buildOperatingLoopOpsMessage({
    runId: input.runId,
    output: input.output,
    appBaseUrl: config.config.appBaseUrl,
  });
  await postSlackMessage({
    userId: input.userId,
    channel: "ops",
    text: opsMessage.text,
    blocks: opsMessage.blocks,
    payload: { source: "jolene_operating_loop", runId: input.runId },
  });

  const approvalMessage = buildOperatingLoopApprovalMessage({
    runId: input.runId,
    output: input.output,
    appBaseUrl: config.config.appBaseUrl,
  });
  if (approvalMessage) {
    await postSlackMessage({
      userId: input.userId,
      channel: "approvals",
      text: approvalMessage.text,
      blocks: approvalMessage.blocks,
      payload: { source: "jolene_operating_loop", runId: input.runId, approvals: true },
    });
  }
}

export async function notifySlackSearchOptimization(input: {
  userId: string;
  summary: SearchOptimizationSummary;
}) {
  const config = getSlackConfig();
  if (!config.configured) return;

  const opsMessage = buildSearchOptimizationOpsMessage({
    summary: input.summary,
    appBaseUrl: config.config.appBaseUrl,
  });
  await postSlackMessage({
    userId: input.userId,
    channel: "ops",
    text: opsMessage.text,
    blocks: opsMessage.blocks,
    payload: { source: "recruiting_search_team", runId: input.summary.agentRunId, optimizationRunId: input.summary.optimizationRunId },
  });

  const approvalMessage = buildSearchOptimizationApprovalMessage({
    summary: input.summary,
    appBaseUrl: config.config.appBaseUrl,
  });
  if (approvalMessage) {
    await postSlackMessage({
      userId: input.userId,
      channel: "approvals",
      text: approvalMessage.text,
      blocks: approvalMessage.blocks,
      payload: { source: "recruiting_search_team", runId: input.summary.agentRunId, optimizationRunId: input.summary.optimizationRunId, approvals: true },
    });
  }
}
