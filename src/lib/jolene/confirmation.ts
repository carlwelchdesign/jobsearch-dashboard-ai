import { JoleneMessageRole, type Prisma } from "@prisma/client";
import { runDailyCommandCenterAgent } from "@/lib/agents/daily-command-center";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { controlGraphAgentRun, type GraphRunControlAction } from "@/lib/agents/graph-run-controls";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { repairApplicationIntegrity } from "@/lib/applications/integrity";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";

export type JoleneExecutionBoundary = "internal_repairs_only";

export type JoleneConfirmableAction = {
  id: string;
  label: string;
  detail: string;
  risk: "guarded_mutation" | "external_blocked";
  status: "planned" | "executed" | "skipped" | "failed" | "cancelled";
  href?: string;
  executable?: boolean;
  parameters?: Record<string, unknown>;
};

export type JoleneConfirmationPlan = {
  confirmationPlanId: string;
  requiresConfirmation: true;
  allowedExecution: JoleneExecutionBoundary;
  plannedActions: JoleneConfirmableAction[];
  expiresAt: string;
};

export type JoleneConfirmationResult = {
  updatedMessage: {
    id: string;
    role: JoleneMessageRole;
    content: string;
    actionJson?: Prisma.JsonValue;
    createdAt: Date;
  };
  assistantMessage: {
    id: string;
    role: JoleneMessageRole;
    content: string;
    actionJson?: Prisma.JsonValue;
    createdAt: Date;
  };
  executedActions: JoleneConfirmableAction[];
  clientAction?: { type: "navigate"; href: string; refresh?: boolean } | { type: "refresh" };
};

const CONFIRMATION_TTL_MS = 30 * 60 * 1000;
const INTERNAL_ACTIONS = new Set([
  "repair_application_integrity",
  "check_duplicates",
  "sync_email",
  "run_daily_command_center",
  "run_market_intelligence",
  "repair_agent_run",
  "retry_agent_run",
  "cancel_agent_run",
]);

export function createJoleneConfirmationPlan(actions: JoleneConfirmableAction[]): JoleneConfirmationPlan {
  return {
    confirmationPlanId: crypto.randomUUID(),
    requiresConfirmation: true,
    allowedExecution: "internal_repairs_only",
    plannedActions: actions,
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
  };
}

export async function executeJoleneConfirmation(input: {
  userId: string;
  messageId: string;
  confirmationPlanId: string;
}): Promise<JoleneConfirmationResult> {
  const message = await prisma.joleneMessage.findUnique({
    where: { id: input.messageId },
    include: { conversation: { select: { id: true, userId: true } } },
  });
  if (!message || message.conversation.userId !== input.userId) throw new Error("Confirmation plan not found.");
  if (message.role !== JoleneMessageRole.ASSISTANT) throw new Error("Only assistant confirmation plans can be confirmed.");

  const actionJson = objectJson(message.actionJson);
  if (actionJson.confirmationPlanId !== input.confirmationPlanId) throw new Error("Confirmation plan mismatch.");
  if (actionJson.requiresConfirmation !== true) throw new Error("This plan no longer requires confirmation.");
  if (actionJson.allowedExecution !== "internal_repairs_only") throw new Error("Unsupported Jolene execution boundary.");
  if (typeof actionJson.confirmedAt === "string") throw new Error("This plan has already been confirmed.");
  if (typeof actionJson.cancelledAt === "string") throw new Error("This plan was cancelled.");
  if (typeof actionJson.expiresAt === "string" && Date.parse(actionJson.expiresAt) < Date.now()) {
    throw new Error("This confirmation plan expired. Ask Jolene to inspect the current state again.");
  }

  const plannedActions = parsePlannedActions(actionJson.plannedActions);
  if (!plannedActions.length) throw new Error("No executable actions were found in this plan.");

  const executedActions: JoleneConfirmableAction[] = [];
  let clientAction: JoleneConfirmationResult["clientAction"] | undefined;

  for (const action of plannedActions) {
    if (!action.executable || !INTERNAL_ACTIONS.has(action.id)) {
      executedActions.push({
        ...action,
        status: "skipped",
        detail: `${action.detail} This action is not executable inside Jolene's internal-repairs boundary.`,
      });
      continue;
    }

    try {
      const result = await executeInternalAction(action, input.userId);
      executedActions.push({ ...action, status: "executed", detail: result.detail, href: result.href ?? action.href });
      clientAction ??= result.clientAction;
    } catch (error) {
      executedActions.push({
        ...action,
        status: "failed",
        detail: error instanceof Error ? error.message : "Jolene could not execute this confirmed action.",
      });
    }
  }

  const confirmedActionJson = toJsonInput({
    ...actionJson,
    requiresConfirmation: false,
    confirmedAt: new Date().toISOString(),
    plannedActions: plannedActions.map((action) => ({ ...action, status: action.status === "planned" ? "cancelled" : action.status })),
    executedActions,
  });

  const [updatedMessage, assistantMessage] = await prisma.$transaction([
    prisma.joleneMessage.update({
      where: { id: message.id },
      data: { actionJson: confirmedActionJson },
    }),
    prisma.joleneMessage.create({
      data: {
        conversationId: message.conversation.id,
        role: JoleneMessageRole.ASSISTANT,
        content: confirmationReply(executedActions),
        contextJson: {},
        actionJson: toJsonInput({
          action: "jolene_confirmed_actions",
          sourceMessageId: message.id,
          confirmationPlanId: input.confirmationPlanId,
          executedActions,
        }),
      },
    }),
  ]);

  return { updatedMessage, assistantMessage, executedActions, clientAction };
}

export async function cancelJoleneConfirmation(input: {
  userId: string;
  messageId: string;
  confirmationPlanId: string;
}) {
  const message = await prisma.joleneMessage.findUnique({
    where: { id: input.messageId },
    include: { conversation: { select: { userId: true } } },
  });
  if (!message || message.conversation.userId !== input.userId) throw new Error("Confirmation plan not found.");

  const actionJson = objectJson(message.actionJson);
  if (actionJson.confirmationPlanId !== input.confirmationPlanId) throw new Error("Confirmation plan mismatch.");

  return prisma.joleneMessage.update({
    where: { id: message.id },
    data: {
      actionJson: toJsonInput({
        ...actionJson,
        requiresConfirmation: false,
        cancelledAt: new Date().toISOString(),
        plannedActions: parsePlannedActions(actionJson.plannedActions).map((action) => ({ ...action, status: "cancelled" })),
      }),
    },
  });
}

async function executeInternalAction(action: JoleneConfirmableAction, userId: string) {
  if (action.id === "repair_application_integrity") {
    const result = await repairApplicationIntegrity();
    return {
      detail: result.repaired
        ? `Repaired ${result.repaired} application state issue${result.repaired === 1 ? "" : "s"}.`
        : "Application state is already synced.",
      href: "/applications",
      clientAction: { type: "navigate" as const, href: "/applications", refresh: true },
    };
  }

  if (action.id === "check_duplicates") {
    const result = await runDuplicateStaleJobDetectorAgent({ limit: 2000 });
    return {
      detail: `Analyzed ${result.output.analyzedJobs} jobs, found ${result.output.duplicateGroups.length} duplicate group(s), and updated ${result.output.updatedJobs} record(s).`,
      href: "/jobs",
      clientAction: { type: "navigate" as const, href: "/jobs", refresh: true },
    };
  }

  if (action.id === "sync_email") {
    const result = await runJoleneEmailOperationsAgent({ source: "chat" });
    return {
      detail: `Email Ops scanned ${result.output.scanned} message(s), created ${result.output.findingsCreated} finding(s), and drafted ${result.output.calendarDrafts} calendar item(s).`,
      href: "/dashboard/email-ops",
      clientAction: { type: "navigate" as const, href: "/dashboard/email-ops", refresh: true },
    };
  }

  if (action.id === "run_daily_command_center") {
    const result = await runDailyCommandCenterAgent({ userId });
    return {
      detail: `Refreshed Daily Command Center with ${result.output.actions.length} prioritized action(s). ${result.output.summary}`,
      href: "/dashboard",
      clientAction: { type: "navigate" as const, href: "/dashboard", refresh: true },
    };
  }

  if (action.id === "run_market_intelligence") {
    const result = await runMarketIntelligenceAgent({ userId, researchDepth: "standard" });
    return {
      detail: `Refreshed Market Intelligence with ${result.output.marketTemperature.length} lane signal(s) and ${result.output.recommendedActions.length} recommendation(s).`,
      href: "/profiles",
      clientAction: { type: "navigate" as const, href: "/profiles", refresh: true },
    };
  }

  if (action.id === "repair_agent_run" || action.id === "retry_agent_run" || action.id === "cancel_agent_run") {
    const runId = typeof action.parameters?.runId === "string" ? action.parameters.runId : "";
    if (!runId) throw new Error("This agent-run action needs a run id.");
    const graphAction = action.id.replace("_agent_run", "") as GraphRunControlAction;
    const result = await controlGraphAgentRun(runId, graphAction);
    return {
      detail: result.message,
      href: "/agents",
      clientAction: { type: "navigate" as const, href: "/agents", refresh: true },
    };
  }

  throw new Error("Unsupported Jolene confirmation action.");
}

function parsePlannedActions(value: unknown): JoleneConfirmableAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const action = item as Record<string, unknown>;
    if (typeof action.id !== "string" || typeof action.label !== "string" || typeof action.detail !== "string") return [];
    return [{
      id: action.id,
      label: action.label,
      detail: action.detail,
      risk: action.risk === "external_blocked" || action.risk === "external_manual_gate" ? "external_blocked" : "guarded_mutation",
      status: action.status === "executed" || action.status === "skipped" || action.status === "failed" || action.status === "cancelled" ? action.status : "planned",
      href: typeof action.href === "string" ? action.href : undefined,
      executable: action.executable === true,
      parameters: objectJson(action.parameters),
    }];
  });
}

function confirmationReply(actions: JoleneConfirmableAction[]) {
  const executed = actions.filter((action) => action.status === "executed");
  const failed = actions.filter((action) => action.status === "failed");
  const skipped = actions.filter((action) => action.status === "skipped");
  return [
    executed.length ? `Confirmed. I executed ${executed.length} internal action${executed.length === 1 ? "" : "s"}.` : "I did not execute any internal actions.",
    failed.length ? `${failed.length} action${failed.length === 1 ? "" : "s"} failed.` : null,
    skipped.length ? `${skipped.length} action${skipped.length === 1 ? " was" : "s were"} skipped because it was outside the allowed boundary.` : null,
  ].filter(Boolean).join(" ");
}

function objectJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
