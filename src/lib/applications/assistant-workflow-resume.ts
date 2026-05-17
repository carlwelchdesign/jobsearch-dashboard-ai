import type { Prisma } from "@prisma/client";
import { storeObservedFieldLearning } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";

type AssistantWorkflowEvent = {
  type: string;
  message: string;
  at: string;
  payload?: Record<string, unknown>;
};

type AssistantWorkflowField = {
  fieldId: string;
  selector: string | null;
  label: string;
  inputType: string | null;
  required: boolean;
  category: string;
  status: string | null;
  context: string | null;
  valuePreview?: string | null;
  decision?: string | null;
  result?: string | null;
  confidence?: number | null;
  memoryMatchId?: string | null;
};

type AssistantWorkflowCommand = {
  id: string;
  type: "fill" | "upload" | "skip" | "ask_user" | "observe" | "stop_for_submit";
  fieldId?: string | null;
  selector?: string | null;
  value?: string | null;
  material?: "resume" | "cover_letter" | null;
  reason: string;
  requiresUserApproval: boolean;
  createdAt: string;
};

type AssistantWorkflowState = {
  applicationId: string;
  origin: string;
  graphThreadId: string;
  automationRunId: string | null;
  currentNode: string;
  status: "RUNNING" | "NEEDS_USER" | "READY_TO_SUBMIT" | "SUBMITTED" | "FAILED";
  events: AssistantWorkflowEvent[];
  fields: AssistantWorkflowField[];
  pendingCommand: AssistantWorkflowCommand | null;
  pendingFieldId: string | null;
  pendingUserRequestId: string | null;
  filledFields: string[];
  skippedFields: string[];
  blockedFields: string[];
  observedManualFields: string[];
  error: string | null;
};

export async function resumeApplicationAssistantWorkflowWithRequestAnswer(input: {
  requestId: string;
  answer: string;
}) {
  const request = await prisma.agentUserRequest.findUnique({
    where: { id: input.requestId },
    include: {
      application: { include: { jobPosting: true } },
    },
  });
  if (!request?.applicationId || !request.application) return null;
  const context = request.contextJson && typeof request.contextJson === "object" && !Array.isArray(request.contextJson)
    ? request.contextJson as { source?: string; field?: AssistantWorkflowField }
    : {};
  if (context.source !== "application_assistant_field_command" || !context.field) return null;

  const run = await prisma.applicationAutomationRun.findFirst({
    where: { applicationId: request.applicationId },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;

  const state = workflowStateFromRun(run);
  const field = context.field;
  const answer = input.answer.trim();
  if (!answer) return null;

  await storeObservedFieldLearning({
    userId: run.userId,
    applicationId: run.applicationId,
    atsProvider: request.application.jobPosting.atsProvider,
    host: hostFromUrl(request.application.jobPosting.applicationUrl),
    fields: [{
      fieldKey: field.fieldId,
      category: field.category,
      label: field.label,
      inputType: field.inputType,
      selector: field.selector,
      answer,
      source: "assistant_confirmation",
      confidence: 86,
    }],
  }).catch(() => null);

  const nextCommand = command("fill", {
    fieldId: field.fieldId,
    selector: field.selector,
    value: answer,
    reason: "User answered this field request in Needs Me.",
  });
  const nextState: AssistantWorkflowState = {
    ...state,
    currentNode: "resumeWithUserAnswer",
    status: "RUNNING",
    pendingCommand: nextCommand,
    pendingFieldId: field.fieldId,
    pendingUserRequestId: null,
    fields: state.fields.some((candidate) => candidate.fieldId === field.fieldId)
      ? state.fields.map((candidate) => candidate.fieldId === field.fieldId
        ? { ...candidate, decision: "fill", confidence: 86 }
        : candidate)
      : [...state.fields, { ...field, decision: "fill", confidence: 86 }],
    events: [
      ...state.events,
      workflowEvent("resumeWithUserAnswer", "User answered a paused application field; assistant can continue filling.", {
        requestId: input.requestId,
        fieldId: field.fieldId,
      }),
    ],
  };
  await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      currentNode: nextState.currentNode,
      workflowStateJson: nextState as unknown as Prisma.InputJsonValue,
    },
  });
  return nextState;
}

function workflowStateFromRun(run: {
  id: string;
  graphThreadId: string | null;
  currentNode: string | null;
  status: string;
  applicationId?: string;
  workflowStateJson: Prisma.JsonValue;
}): AssistantWorkflowState {
  const value = run.workflowStateJson && typeof run.workflowStateJson === "object" && !Array.isArray(run.workflowStateJson)
    ? run.workflowStateJson as Partial<AssistantWorkflowState>
    : {};
  return {
    applicationId: value.applicationId ?? run.applicationId ?? "",
    origin: value.origin ?? "",
    graphThreadId: value.graphThreadId ?? run.graphThreadId ?? "",
    automationRunId: value.automationRunId ?? run.id,
    currentNode: value.currentNode ?? run.currentNode ?? "unknown",
    status: value.status ?? run.status as AssistantWorkflowState["status"],
    error: value.error ?? null,
    events: Array.isArray(value.events) ? value.events : [],
    fields: Array.isArray(value.fields) ? value.fields : [],
    pendingCommand: isWorkflowCommand(value.pendingCommand) ? value.pendingCommand : null,
    pendingFieldId: typeof value.pendingFieldId === "string" ? value.pendingFieldId : null,
    pendingUserRequestId: typeof value.pendingUserRequestId === "string" ? value.pendingUserRequestId : null,
    filledFields: stringArray(value.filledFields),
    skippedFields: stringArray(value.skippedFields),
    blockedFields: stringArray(value.blockedFields),
    observedManualFields: stringArray(value.observedManualFields),
  };
}

function command(type: AssistantWorkflowCommand["type"], input: Partial<AssistantWorkflowCommand> & { reason: string }): AssistantWorkflowCommand {
  return {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    fieldId: input.fieldId ?? null,
    selector: input.selector ?? null,
    value: input.value ?? null,
    material: input.material ?? null,
    reason: input.reason,
    requiresUserApproval: input.requiresUserApproval ?? false,
    createdAt: new Date().toISOString(),
  };
}

function workflowEvent(type: string, message: string, payload?: Record<string, unknown>): AssistantWorkflowEvent {
  return {
    type,
    message,
    at: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };
}

function hostFromUrl(url?: string | null) {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function isWorkflowCommand(value: unknown): value is AssistantWorkflowCommand {
  return Boolean(value && typeof value === "object" && "id" in value && "type" in value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
