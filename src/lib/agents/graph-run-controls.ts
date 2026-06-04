import type { AgentRun, AgentRunEvent, Prisma } from "@prisma/client";
import { createQualityExampleFromAgentRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

export type GraphRunControlAction = "resume" | "retry" | "cancel" | "repair";

export type GraphRunControlResult = {
  runId: string;
  status: string;
  currentNode: string | null;
  message: string;
  latestEvent: {
    id: string;
    type: string;
    message: string;
    createdAt: string;
  } | null;
  childRunId?: string;
};

type GraphRunWithEvents = AgentRun & {
  events: AgentRunEvent[];
};

const STALE_RUNNING_MS = 10 * 60 * 1000;
const SUPPORTED_AGENT_TYPES = new Set(["RECRUITING_AGENCY"]);

export async function controlGraphAgentRun(runId: string, action: GraphRunControlAction): Promise<GraphRunControlResult> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { events: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!run) throw new Error("Agent run not found.");
  assertGraphRunSupported(run);

  if (action === "cancel") return cancelGraphRun(run);
  if (action === "repair") return repairGraphRun(run);
  if (action === "retry") return retryGraphRun(run, "retry_after_failure");
  return resumeGraphRun(run);
}

export function graphRunControlState(run: Pick<AgentRun, "agentType" | "status" | "graphThreadId" | "workflowVersion" | "updatedAt"> & { events?: Array<Pick<AgentRunEvent, "createdAt">> }) {
  const supported = isGraphRunSupported(run);
  const stale = supported && isStaleRunningGraphRun(run);
  return {
    supported,
    stale,
    canCancel: supported && (run.status === "RUNNING" || run.status === "PENDING"),
    canRepair: supported && stale,
    canRetry: supported && (run.status === "FAILED" || stale),
    canResume: supported && (run.status === "RUNNING" || run.status === "FAILED"),
  };
}

function assertGraphRunSupported(run: Pick<AgentRun, "agentType" | "graphThreadId" | "workflowVersion">) {
  if (!isGraphRunSupported(run)) {
    throw new Error("This agent run is not a supported graph-backed workflow.");
  }
}

function isGraphRunSupported(run: Pick<AgentRun, "agentType" | "graphThreadId" | "workflowVersion">) {
  return Boolean(run.graphThreadId && run.workflowVersion && SUPPORTED_AGENT_TYPES.has(run.agentType));
}

function isStaleRunningGraphRun(run: Pick<AgentRun, "status" | "updatedAt"> & { events?: Array<Pick<AgentRunEvent, "createdAt">> }) {
  if (run.status !== "RUNNING" && run.status !== "PENDING") return false;
  const latestEventAt = run.events?.[0]?.createdAt;
  const lastActivityAt = latestEventAt && latestEventAt > run.updatedAt ? latestEventAt : run.updatedAt;
  return Date.now() - lastActivityAt.getTime() > STALE_RUNNING_MS;
}

async function cancelGraphRun(run: GraphRunWithEvents): Promise<GraphRunControlResult> {
  if (run.status !== "RUNNING" && run.status !== "PENDING") {
    throw new Error("Only pending or running graph-backed agent runs can be cancelled.");
  }
  const event = await createAgentRunEvent(run.id, "run_cancelled", "Graph run was cancelled by the user.", {
    previousStatus: run.status,
    previousNode: run.currentNode,
  });
  const updated = await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "FAILED",
      currentNode: "manual_cancel",
      error: "Graph run was cancelled by the user.",
      workflowStateJson: mergeWorkflowState(run.workflowStateJson, {
        currentNode: "manual_cancel",
        error: "Graph run was cancelled by the user.",
        cancelledAt: new Date().toISOString(),
      }),
    },
  });
  await createQualityExampleFromAgentRun(run.id, "RECRUITING_AGENCY", "manual_cancel").catch(() => null);
  return resultFromRun(updated, "Graph run cancelled.", event);
}

async function repairGraphRun(run: GraphRunWithEvents): Promise<GraphRunControlResult> {
  if (!isStaleRunningGraphRun(run)) {
    throw new Error("Only stale pending or running graph-backed agent runs can be repaired.");
  }
  const event = await createAgentRunEvent(run.id, "stale_run_repaired", "Stale graph run was marked failed so it can be retried safely.", {
    previousStatus: run.status,
    previousNode: run.currentNode,
  });
  const updated = await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "FAILED",
      currentNode: "stale_graph_run",
      error: "Graph run became stale before completing. Retry to start a recovery run.",
      workflowStateJson: mergeWorkflowState(run.workflowStateJson, {
        currentNode: "stale_graph_run",
        error: "Graph run became stale before completing.",
        repairedAt: new Date().toISOString(),
      }),
    },
  });
  await createQualityExampleFromAgentRun(run.id, "RECRUITING_AGENCY", "stale_graph_run").catch(() => null);
  return resultFromRun(updated, "Stale graph run repaired. Retry is now available.", event);
}

async function retryGraphRun(run: GraphRunWithEvents, failureCategory: string): Promise<GraphRunControlResult> {
  if (run.status !== "FAILED" && !isStaleRunningGraphRun(run)) {
    throw new Error("Only failed or stale graph-backed agent runs can be retried.");
  }
  const sourceRun = isStaleRunningGraphRun(run) ? await repairGraphRun(run) : null;
  const event = await createAgentRunEvent(run.id, "retry_started", "Retry started as a child graph run.", {
    failureCategory,
    repairedBeforeRetry: Boolean(sourceRun),
  });
  await createQualityExampleFromAgentRun(run.id, "RECRUITING_AGENCY", failureCategory).catch(() => null);

  const retryInput = recruitingAgencyInputFromRun(run);
  const { runRecruitingAgency } = await import("@/lib/applications/recruiting-agency");
  const child = await runRecruitingAgency({
    ...retryInput,
    triggeredBy: "manual",
    parentRunId: run.id,
  });
  return {
    runId: run.id,
    status: run.status,
    currentNode: run.currentNode,
    message: `Retry completed as child run ${child.agentRunId}.`,
    latestEvent: serializeEvent(event),
    childRunId: child.agentRunId,
  };
}

async function resumeGraphRun(run: GraphRunWithEvents): Promise<GraphRunControlResult> {
  if (run.status === "RUNNING" || run.status === "PENDING") {
    if (!isStaleRunningGraphRun(run)) {
      return resultFromRun(run, "Graph run is still active; no recovery action was needed.", run.events[0] ?? null);
    }
    const retry = await retryGraphRun(run, "resume_failed");
    return {
      ...retry,
      message: `Stale graph run could not be resumed in place, so a recovery child run was completed as ${retry.childRunId}.`,
    };
  }
  if (run.status === "FAILED") return retryGraphRun(run, "resume_failed");
  throw new Error("Completed graph-backed agent runs do not need resume.");
}

function recruitingAgencyInputFromRun(run: Pick<AgentRun, "inputJson">) {
  const input = objectJson(run.inputJson);
  return {
    minimumScore: typeof input.minimumScore === "number" ? input.minimumScore : 90,
    limit: typeof input.limit === "number" ? input.limit : 50,
  };
}

async function createAgentRunEvent(agentRunId: string, type: string, message: string, payload: unknown = {}) {
  return prisma.agentRunEvent.create({
    data: {
      agentRunId,
      type,
      message,
      payloadJson: toJson(payload),
    },
  });
}

function resultFromRun(run: Pick<AgentRun, "id" | "status" | "currentNode">, message: string, event: AgentRunEvent | null): GraphRunControlResult {
  return {
    runId: run.id,
    status: run.status,
    currentNode: run.currentNode,
    message,
    latestEvent: event ? serializeEvent(event) : null,
  };
}

function serializeEvent(event: AgentRunEvent) {
  return {
    id: event.id,
    type: event.type,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
  };
}

function mergeWorkflowState(value: Prisma.JsonValue, patch: Record<string, unknown>): Prisma.InputJsonValue {
  return toJson({
    ...objectJson(value),
    ...patch,
  });
}

function objectJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
