import type { Prisma } from "@prisma/client";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { resolveApplicationFieldAnswer } from "@/lib/applications/field-answer-resolver";
import { storeObservedFieldLearning, type ObservedApplicationField } from "@/lib/applications/field-learning";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { traceWorkflowStep } from "@/lib/observability/langsmith";
import { createQualityExampleFromAutomationRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

export type AssistantWorkflowEvent = {
  type: string;
  message: string;
  at: string;
  payload?: Record<string, unknown>;
};

export type AssistantWorkflowState = {
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

export type AssistantWorkflowField = {
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

type AssistantWorkflowBrowserField = {
  fieldId?: string | null;
  selector?: string | null;
  label?: string | null;
  inputType?: string | null;
  required?: boolean | null;
  category?: string | null;
  status?: string | null;
  type?: string | null;
  context?: string | null;
  valuePreview?: string | null;
};

export type AssistantWorkflowCommand = {
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

export type AssistantWorkflowBrowserEvent = {
  type: string;
  message?: string | null;
  fieldId?: string | null;
  selector?: string | null;
  label?: string | null;
  inputType?: string | null;
  required?: boolean | null;
  category?: string | null;
  status?: string | null;
  valuePreview?: string | null;
  fields?: AssistantWorkflowBrowserField[];
  submitIntent?: {
    at?: number | string;
    source?: string | null;
    descriptor?: string | null;
    url?: string | null;
  };
  closeReason?: "after_submit" | "without_submit";
  result?: string | null;
  error?: string | null;
  url?: string | null;
  blockerType?: string | null;
  atsProvider?: string | null;
  safeRetry?: string | null;
  at?: string | null;
  payload?: Record<string, unknown>;
};

type KnownFieldApplication = Prisma.ApplicationGetPayload<{
  include: {
    coverLetter: true;
    jobPosting: true;
    user: { include: { profile: true } };
  };
}>;

export type SerializedAssistantWorkflowStatus = {
  graphThreadId: string | null;
  currentNode: string | null;
  status: string | null;
  automationRunId: string | null;
  events: AssistantWorkflowEvent[];
  latestEvent: AssistantWorkflowEvent | null;
  fields: AssistantWorkflowField[];
  pendingCommand: AssistantWorkflowCommand | null;
  counts: {
    detected: number;
    filled: number;
    skipped: number;
    blocked: number;
    observed: number;
  };
};

export async function getApplicationAssistantWorkflowStatus(applicationId: string): Promise<SerializedAssistantWorkflowStatus | null> {
  const run = await prisma.applicationAutomationRun.findFirst({
    where: { applicationId },
    orderBy: { startedAt: "desc" },
  });
  return run ? serializeWorkflowStatus(run) : null;
}

export async function resumeApplicationAssistantWorkflow(input: {
  applicationId: string;
  action?: string;
  message?: string;
  host?: string;
  fields?: ObservedApplicationField[];
}) {
  const run = await prisma.applicationAutomationRun.findFirst({
    where: { applicationId: input.applicationId },
    include: { application: true, jobPosting: true },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("No assistant workflow has been started for this application.");

  let learning: { saved: number; ignored: number } | null = null;
  if (input.fields?.length && input.host) {
    learning = await storeObservedFieldLearning({
      userId: run.userId,
      applicationId: run.applicationId,
      atsProvider: run.jobPosting.atsProvider,
      host: input.host,
      fields: input.fields,
    });
  }

  const state = workflowStateFromRun(run);
  const nextState: AssistantWorkflowState = {
    ...state,
    currentNode: input.action === "manual_input_observed" ? "observeManualInput" : "pauseForUser",
    status: "NEEDS_USER",
    events: [
      ...state.events,
      workflowEvent(input.action ?? "workflow_resumed", input.message ?? "Assistant workflow resumed with user input.", learning ?? undefined),
    ],
  };
  await persistWorkflowState(run.id, nextState);
  return serializeWorkflowStatus(await prisma.applicationAutomationRun.findUniqueOrThrow({ where: { id: run.id } }));
}

export async function ingestApplicationAssistantWorkflowEvent(input: {
  applicationId: string;
  event: AssistantWorkflowBrowserEvent;
}) {
  const run = await latestWorkflowRun(input.applicationId);
  const state = workflowStateFromRun(run);
  const nextState = await traceWorkflowStep(
    `assistant.event.${input.event.type}`,
    {
      applicationId: input.applicationId,
      automationRunId: run.id,
      graphThreadId: run.graphThreadId,
      eventType: input.event.type,
      fieldId: input.event.fieldId ?? null,
      label: input.event.label ?? null,
      inputType: input.event.inputType ?? null,
      category: input.event.category ?? null,
      fieldCount: input.event.fields?.length ?? null,
    },
    () => reduceBrowserEvent(run, state, input.event),
  );
  await persistWorkflowState(run.id, nextState);
  await appendWorkflowAction(run.id, {
    type: input.event.type,
    message: input.event.message ?? workflowEventMessage(input.event),
    at: input.event.at ?? new Date().toISOString(),
  });
  return serializeWorkflowStatus(await prisma.applicationAutomationRun.findUniqueOrThrow({ where: { id: run.id } }));
}

export async function getApplicationAssistantWorkflowCommand(applicationId: string) {
  const run = await latestWorkflowRun(applicationId);
  const state = workflowStateFromRun(run);
  return {
    command: state.pendingCommand,
    workflow: serializeWorkflowStatus(run),
  };
}

export async function recordApplicationAssistantWorkflowCommandResult(input: {
  applicationId: string;
  commandId: string;
  result: "success" | "failed" | "skipped";
  message?: string | null;
  valuePreview?: string | null;
}) {
  const run = await latestWorkflowRun(input.applicationId);
  const state = workflowStateFromRun(run);
  if (state.pendingCommand?.id && state.pendingCommand.id !== input.commandId) {
    throw new Error("Command result does not match the active assistant command.");
  }
  const fieldId = state.pendingCommand?.fieldId ?? null;
  const nextFields = fieldId
    ? state.fields.map((field) => field.fieldId === fieldId
      ? { ...field, result: input.result, valuePreview: input.valuePreview ?? field.valuePreview ?? null }
      : field)
    : state.fields;
  const generatedLearning = input.result === "success" && state.currentNode === "resolveGeneratedFieldAnswer" && state.pendingCommand?.type === "fill" && fieldId
    ? await rememberAcceptedGeneratedAnswer(run, state.fields.find((field) => field.fieldId === fieldId) ?? null, state.pendingCommand.value ?? input.valuePreview ?? "").catch(() => null)
    : null;
  const nextState: AssistantWorkflowState = {
    ...state,
    currentNode: input.result === "success" ? "decideNextField" : "validatePage",
    pendingCommand: null,
    pendingFieldId: null,
    fields: nextFields,
    filledFields: fieldId && input.result === "success" && !state.filledFields.includes(fieldId)
      ? [...state.filledFields, fieldId]
      : state.filledFields,
    skippedFields: fieldId && input.result === "skipped" && !state.skippedFields.includes(fieldId)
      ? [...state.skippedFields, fieldId]
      : state.skippedFields,
    blockedFields: fieldId && input.result === "failed" && !state.blockedFields.includes(fieldId)
      ? [...state.blockedFields, fieldId]
      : state.blockedFields,
    events: [
      ...state.events,
      workflowEvent("field_result", input.message ?? `Field command ${input.result}.`, {
        commandId: input.commandId,
        fieldId,
        result: input.result,
      }),
      ...(generatedLearning?.saved
        ? [workflowEvent("generated_answer_learned", "Generated answer accepted and learned for future reuse.", {
            fieldId,
            saved: generatedLearning.saved,
            activeForAutofill: generatedLearning.activeForAutofill,
            needsReview: generatedLearning.needsReview,
          })]
        : []),
    ],
  };
  const commandedState = await traceWorkflowStep(
    "assistant.command_result",
    {
      applicationId: input.applicationId,
      automationRunId: run.id,
      commandId: input.commandId,
      commandType: state.pendingCommand?.type ?? null,
      fieldId,
      result: input.result,
    },
    () => ensureNextCommand(run, nextState),
  );
  await persistWorkflowState(run.id, commandedState);
  return {
    workflow: serializeWorkflowStatus(await prisma.applicationAutomationRun.findUniqueOrThrow({ where: { id: run.id } })),
    command: commandedState.pendingCommand,
  };
}

async function rememberAcceptedGeneratedAnswer(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  field: AssistantWorkflowField | null,
  answer: string,
) {
  const value = answer.trim();
  if (!field || !value) return null;
  const jobPosting = await prisma.jobPosting.findUnique({
    where: { id: run.jobPostingId },
    select: { atsProvider: true, applicationUrl: true },
  });
  if (!jobPosting) return null;
  return storeObservedFieldLearning({
    userId: run.userId,
    applicationId: run.applicationId,
    atsProvider: jobPosting.atsProvider,
    host: hostFromUrl(run.currentUrl ?? jobPosting.applicationUrl),
    fields: [{
      fieldKey: field.fieldId,
      category: field.category,
      label: field.label,
      inputType: field.inputType,
      selector: field.selector,
      answer: value,
      source: "assistant_confirmation",
      confidence: 88,
    }],
  });
}

export async function persistWorkflowState(automationRunId: string, state: AssistantWorkflowState) {
  await prisma.applicationAutomationRun.update({
    where: { id: automationRunId },
    data: {
      graphThreadId: state.graphThreadId,
      currentNode: state.currentNode,
      workflowStateJson: state as unknown as Prisma.InputJsonValue,
    },
  });
}

export function serializeWorkflowStatus(run: {
  id: string;
  graphThreadId: string | null;
  currentNode: string | null;
  status: string;
  workflowStateJson: Prisma.JsonValue;
}) {
  const state = workflowStateFromRun(run);
  const events = state.events ?? [];
  return {
    graphThreadId: run.graphThreadId,
    currentNode: run.currentNode ?? state.currentNode ?? null,
    status: state.status ?? run.status,
    automationRunId: run.id,
    events,
    latestEvent: events.at(-1) ?? null,
    fields: state.fields,
    pendingCommand: state.pendingCommand,
    counts: {
      detected: state.fields.length,
      filled: state.filledFields.length,
      skipped: state.skippedFields.length,
      blocked: state.blockedFields.length,
      observed: state.observedManualFields.length,
    },
  };
}

function workflowStateFromRun(run: {
  id: string;
  graphThreadId: string | null;
  currentNode: string | null;
  status: string;
  applicationId?: string;
  workflowStateJson: Prisma.JsonValue;
}) {
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

export function workflowEvent(type: string, message: string, payload?: Record<string, unknown>): AssistantWorkflowEvent {
  return {
    type,
    message,
    at: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };
}

async function latestWorkflowRun(applicationId: string) {
  const run = await prisma.applicationAutomationRun.findFirst({
    where: { applicationId },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("No assistant workflow has been started for this application.");
  return run;
}

async function reduceBrowserEvent(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  state: AssistantWorkflowState,
  event: AssistantWorkflowBrowserEvent,
): Promise<AssistantWorkflowState> {
  if (event.type === "field_inventory") {
    const fields = normalizeWorkflowFields(event.fields ?? []);
    return ensureNextCommand(run, {
      ...state,
      currentNode: "inspectPage",
      status: "RUNNING",
      fields,
      events: [
        ...state.events,
        workflowEvent("field_inventory", event.message ?? `Detected ${fields.length} application field(s).`, {
          fieldCount: fields.length,
          url: event.url ?? null,
        }),
      ],
    });
  }

  if (event.type === "manual_input_observed") {
    const observedFields = normalizeWorkflowFields(event.fields ?? (event.label ? [event] : []));
    const observedFieldIds = observedFields.map((field) => field.fieldId);
    const nextFields = state.fields.map((field) => {
      const observed = observedFields.find((candidate) => fieldsRepresentSameControl(field, candidate));
      return observed
        ? { ...field, result: "success", status: "observed", valuePreview: observed.valuePreview ?? field.valuePreview ?? null, decision: field.decision ?? "observe" }
        : field;
    });
    const matchedObservedIds = nextFields
      .filter((field) => field.result === "success" && observedFields.some((candidate) => fieldsRepresentSameControl(field, candidate)))
      .map((field) => field.fieldId);
    const nextState: AssistantWorkflowState = {
      ...state,
      currentNode: "observeManualInput",
      status: "RUNNING",
      pendingCommand: state.pendingCommand?.type === "observe" ? null : state.pendingCommand,
      pendingFieldId: state.pendingCommand?.type === "observe" ? null : state.pendingFieldId,
      fields: nextFields,
      filledFields: uniqueStrings([...state.filledFields, ...matchedObservedIds]),
      observedManualFields: uniqueStrings([...state.observedManualFields, ...observedFieldIds]),
      events: [
        ...state.events,
        workflowEvent("manual_input_observed", event.message ?? "Observed manual field input for future learning.", {
          fieldCount: observedFields.length,
          labels: observedFields.map((field) => field.label).slice(0, 8),
        }),
      ],
    };
    return ensureNextCommand(run, nextState);
  }

  if (event.type === "submit_intent_detected") {
    return {
      ...state,
      currentNode: "detectSubmitOrClose",
      events: [
        ...state.events,
        workflowEvent("submit_intent_detected", event.message ?? "Manual submit intent detected.", {
          submitIntent: safeSubmitIntent(event.submitIntent),
        }),
      ],
    };
  }

  if (event.type === "submit_confirmation") {
    await markApplicationSubmitted(run.applicationId, run.id, event.message ?? "Manual submit confirmation detected.");
    return {
      ...state,
      currentNode: "detectSubmitOrClose",
      status: "SUBMITTED",
      pendingCommand: null,
      events: [...state.events, workflowEvent("submit_confirmation", event.message ?? "Application submission detected.")],
    };
  }

  if (event.type === "browser_closed_after_submit") {
    await markApplicationSubmitted(run.applicationId, run.id, event.message ?? "Browser closed after manual submit click.");
    return {
      ...state,
      currentNode: "detectSubmitOrClose",
      status: "SUBMITTED",
      pendingCommand: null,
      events: [
        ...state.events,
        workflowEvent("browser_closed_after_submit", event.message ?? "Browser closed after manual submit click.", {
          submitIntent: safeSubmitIntent(event.submitIntent),
        }),
      ],
    };
  }

  if (event.type === "browser_closed_without_submit" || event.type === "browser_closed") {
    await markAssistantClosedWithoutSubmit(run, event.message ?? "Assistant browser closed before submit.");
    return {
      ...state,
      currentNode: "detectSubmitOrClose",
      status: "NEEDS_USER",
      pendingCommand: null,
      events: [...state.events, workflowEvent("browser_closed_without_submit", event.message ?? "Assistant browser closed before submit.")],
    };
  }

  if (event.type === "blocker_found") {
    const blockerType = stringPayloadValue(event, "blockerType") ?? "unknown";
    const blockerMessage = event.message ?? blockerMessageForType(blockerType);
    await markAssistantBlocked(run, blockerType, blockerMessage, event);
    return {
      ...state,
      currentNode: "pauseForUser",
      status: "NEEDS_USER",
      pendingCommand: null,
      events: [
        ...state.events,
        workflowEvent("blocker_found", blockerMessage, {
          blockerType,
          url: event.url ?? stringPayloadValue(event, "url") ?? null,
          safeRetry: stringPayloadValue(event, "safeRetry") ?? null,
        }),
      ],
    };
  }

  return {
    ...state,
    events: [...state.events, workflowEvent(event.type, event.message ?? workflowEventMessage(event), { fieldId: event.fieldId ?? null })],
  };
}

async function markAssistantBlocked(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  blockerType: string,
  message: string,
  event: AssistantWorkflowBrowserEvent,
) {
  await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      status: "NEEDS_USER",
      blockerType,
      blockerMessage: message,
      finishedAt: new Date(),
    },
  }).catch(() => null);
  await prisma.applicationEvent.create({
    data: {
      applicationId: run.applicationId,
      type: "note_added",
      payload: {
        source: "application_assistant_workflow",
        automationRunId: run.id,
        status: "NEEDS_USER",
        blockerType,
        blockerMessage: message,
        url: event.url ?? stringPayloadValue(event, "url") ?? null,
      } as Prisma.InputJsonValue,
    },
  }).catch(() => null);

  const existing = await prisma.agentUserRequest.findFirst({
    where: {
      applicationId: run.applicationId,
      type: "APPLICATION_BLOCKED",
      status: "OPEN",
    },
  }).catch(() => null);
  if (!existing) {
    await createAgentUserRequest({
      userId: run.userId,
      applicationId: run.applicationId,
      jobPostingId: run.jobPostingId,
      type: "APPLICATION_BLOCKED",
      question: blockerMessageForType(blockerType, message),
      contextJson: {
        blockerType,
        source: "application_assistant_workflow",
        automationRunId: run.id,
        url: event.url ?? stringPayloadValue(event, "url") ?? null,
        safeRetry: stringPayloadValue(event, "safeRetry") ?? null,
        recommendedActions: recommendedActionsForBlocker(blockerType),
      } as Prisma.InputJsonValue,
    }).catch(() => null);
  }
  await createQualityExampleFromAutomationRun(run.id, "AUTOMATION_RUN").catch(() => null);
}

function blockerMessageForType(blockerType: string, fallback?: string | null) {
  if (blockerType === "ats_spam_block") {
    return "Ashby blocked the assisted submission as possible spam or reCAPTCHA risk. Retry with the Chrome extension in your normal browser, submit manually, or use direct recruiter/company outreach.";
  }
  return fallback || "The assistant found a blocker and needs user input.";
}

function recommendedActionsForBlocker(blockerType: string) {
  if (blockerType === "ats_spam_block") {
    return [
      "Open the Ashby application in your normal Chrome profile.",
      "Use the Job Search OS Chrome extension Fill from Job Search OS action.",
      "Review every field and submit manually.",
      "If Ashby still blocks the submit, use the company direct/recruiter outreach path.",
    ];
  }
  return [];
}

function stringPayloadValue(event: AssistantWorkflowBrowserEvent, key: string) {
  const direct = event[key as keyof AssistantWorkflowBrowserEvent];
  if (typeof direct === "string") return direct;
  const value = event.payload?.[key];
  return typeof value === "string" ? value : null;
}

async function ensureNextCommand(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  state: AssistantWorkflowState,
): Promise<AssistantWorkflowState> {
  if (state.pendingCommand) return state;
  const field = state.fields.find((candidate) => !fieldHandled(state, candidate));
  if (!field) {
    return {
      ...state,
      currentNode: "readyForSubmit",
      status: "READY_TO_SUBMIT",
      pendingCommand: command("stop_for_submit", {
        reason: "All known assistant-controlled fields have been handled. Manual submit is still required.",
      }),
      events: [
        ...state.events,
        workflowEvent("readyForSubmit", "Field-by-field assistant is ready for manual review and submit."),
      ],
    };
  }

  const decision = await traceWorkflowStep(
    "assistant.command_decision",
    {
      applicationId: run.applicationId,
      automationRunId: run.id,
      graphThreadId: run.graphThreadId,
      fieldId: field.fieldId,
      label: field.label,
      inputType: field.inputType,
      category: field.category,
      required: field.required,
      status: field.status,
    },
    () => decideCommandForField(run, field, state.fields),
  );
  return {
    ...state,
    currentNode: decision.currentNode,
    pendingCommand: decision.command,
    pendingFieldId: field.fieldId,
    pendingUserRequestId: decision.pendingUserRequestId ?? state.pendingUserRequestId,
    fields: state.fields.map((candidate) => candidate.fieldId === field.fieldId
      ? { ...candidate, decision: decision.command.type, confidence: decision.confidence ?? null, memoryMatchId: decision.memoryMatchId ?? null }
      : candidate),
    events: [
      ...state.events,
      workflowEvent(decision.currentNode, decision.message, {
        fieldId: field.fieldId,
        commandType: decision.command.type,
      }),
    ],
  };
}

async function decideCommandForField(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  field: AssistantWorkflowField,
  fields: AssistantWorkflowField[] = [field],
) {
  const application = await prisma.application.findUnique({
    where: { id: run.applicationId },
    include: {
      coverLetter: true,
      jobPosting: true,
      user: { include: { profile: true } },
    },
  });
  if (!application) throw new Error("Application not found.");

  const value = valueForKnownField(field, application, fields);
  if (value) {
    return {
      currentNode: "resolveKnownField",
      command: command("fill", {
        fieldId: field.fieldId,
        selector: field.selector,
        value,
        reason: `Known ${field.category} field resolved from application package.`,
      }),
      message: `Resolved known field: ${field.label}`,
      confidence: 90,
    };
  }

  const reusable = await findReusableAnswerMemories(application.userId, field.label, 1);
  if (reusable[0]?.autoUsable) {
    return {
      currentNode: "resolveKnownField",
      command: command("fill", {
        fieldId: field.fieldId,
        selector: field.selector,
        value: reusable[0].answer,
        reason: `Auto-using saved low-risk answer memory (${reusable[0].matchScore}% match).`,
      }),
      message: `Resolved field from answer memory: ${field.label}`,
      confidence: reusable[0].matchScore,
      memoryMatchId: reusable[0].id,
    };
  }

  if (field.inputType === "file" && /resume|cv/i.test(field.label)) {
    return {
      currentNode: "resolveKnownField",
      command: command("upload", {
        fieldId: field.fieldId,
        selector: field.selector,
        material: "resume",
        reason: "Resume upload control detected.",
      }),
      message: `Resolved resume upload field: ${field.label}`,
      confidence: 92,
    };
  }

  if (field.inputType === "file" && /cover/i.test(field.label)) {
    return {
      currentNode: "resolveKnownField",
      command: command("upload", {
        fieldId: field.fieldId,
        selector: field.selector,
        material: "cover_letter",
        reason: "Cover letter upload control detected.",
      }),
      message: `Resolved cover letter upload field: ${field.label}`,
      confidence: 92,
    };
  }

  if (field.required || questionLike(field)) {
    const resolved = await resolveApplicationFieldAnswer({
      applicationId: run.applicationId,
      field: {
        fieldId: field.fieldId,
        selector: field.selector,
        label: field.label,
        inputType: field.inputType,
        category: field.category,
        context: field.context,
      },
    }).catch(() => null);
    if (resolved?.answer && resolved.autoFillAllowed && !requiresSensitiveApproval(field)) {
      return {
        currentNode: "resolveGeneratedFieldAnswer",
        command: command("fill", {
          fieldId: field.fieldId,
          selector: field.selector,
          value: resolved.answer,
          reason: resolved.reason,
        }),
        message: resolved.source === "generated"
          ? `Generated answer for field: ${field.label}`
          : `Resolved field from ${resolved.source.replace("_", " ")}: ${field.label}`,
        confidence: resolved.confidence,
        memoryMatchId: resolved.memoryMatchId ?? reusable[0]?.id ?? null,
      };
    }

    if (!requiresSensitiveApproval(field) && !resolved?.answer) {
      return {
        currentNode: "observeManualInput",
        command: command("observe", {
          fieldId: field.fieldId,
          selector: field.selector,
          reason: "Unknown required or custom field will be learned from manual input instead of interrupting the queue.",
        }),
        message: `Observing manual input for field: ${field.label}`,
        confidence: resolved?.confidence ?? reusable[0]?.matchScore ?? 0,
        memoryMatchId: reusable[0]?.id ?? null,
      };
    }

    const suggestedAnswer = resolved?.answer ?? reusable[0]?.answer ?? "";
    const request = await createAgentUserRequest({
      userId: run.userId,
      applicationId: run.applicationId,
      jobPostingId: run.jobPostingId,
      type: "UNKNOWN_ANSWER",
      question: `How should the assistant answer this application field?\n\n${field.label}`,
      contextJson: {
        source: "application_assistant_field_command",
        field,
        suggestedAnswer,
        fieldAnswerResolution: resolved,
        answerMemory: reusable[0] ?? null,
      } as Prisma.InputJsonValue,
    });
    return {
      currentNode: "pauseForUser",
      command: command("ask_user", {
        fieldId: field.fieldId,
        selector: field.selector,
        value: suggestedAnswer,
        reason: suggestedAnswer
          ? "A generated or saved answer exists, but this field needs user approval before reuse."
          : "Sensitive application field needs user approval before the assistant can continue.",
        requiresUserApproval: true,
      }),
      message: `Needs user input for field: ${field.label}`,
      pendingUserRequestId: request.id,
      confidence: reusable[0]?.matchScore ?? 0,
      memoryMatchId: reusable[0]?.id ?? null,
    };
  }

  return {
    currentNode: "decideNextField",
    command: command("skip", {
      fieldId: field.fieldId,
      selector: field.selector,
      reason: "Optional unknown field skipped by assistant policy.",
    }),
    message: `Skipping optional unknown field: ${field.label}`,
    confidence: 70,
  };
}

function valueForKnownField(field: AssistantWorkflowField, application: KnownFieldApplication, fields: AssistantWorkflowField[] = [field]) {
  const profile = application.user.profile;
  const fullName = profile?.fullName ?? application.user.name ?? "";
  const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);
  const label = `${field.category} ${field.label}`.toLowerCase();
  const hasGithubField = fields.some((candidate) => /\bgithub\b/i.test(`${candidate.category} ${candidate.label}`));
  if (/\b(first name|given name)\b/.test(label)) return firstName;
  if (/\b(last name|family name|surname)\b/.test(label)) return lastNameParts.join(" ");
  if (/\b(full name|name)\b/.test(label)) return fullName;
  if (/\b(email)\b/.test(label)) return profile?.email ?? application.user.email;
  if (/\b(phone|mobile)\b/.test(label)) return profile?.phone ?? "";
  if (/\b(linkedin)\b/.test(label)) return profile?.linkedinUrl ?? "";
  if (/\b(github)\b/.test(label)) return profile?.githubUrl ?? "";
  if (websiteOnlyField(label) && !hasGithubField) return profile?.githubUrl ?? profile?.portfolioUrl ?? "";
  if (/\b(portfolio|website|personal site)\b/.test(label)) return profile?.portfolioUrl ?? "";
  if (/\b(location|city|address)\b/.test(label)) return profile?.location ?? "";
  if (isVeteranStatusField(label)) return profile?.veteranStatusAnswer ?? "";
  if (/\b(race|ethnic)\b/i.test(label)) return profile?.raceAnswer ?? "";
  if (/\b(gender|sex)\b/i.test(label)) return profile?.genderAnswer ?? "";
  if (/\b(disab|ability status)\b/i.test(label)) return profile?.disabilityAnswer ?? "";
  if (/\bcover letter|why.*join|why.*team|why.*company|tell us why/i.test(label)) return application.coverLetter?.body ?? "";
  return "";
}

function isVeteranStatusField(label: string) {
  return /\b(veteran|protected veteran|military service|armed forces)\b/i.test(label);
}

function websiteOnlyField(label: string) {
  return /\b(web\s*site|website|homepage)\b/i.test(label) && !/\b(github|portfolio|personal site|linkedin)\b/i.test(label);
}

function normalizeWorkflowFields(fields: AssistantWorkflowBrowserField[]) {
  const seen = new Set<string>();
  const normalized: AssistantWorkflowField[] = [];
  for (const field of fields) {
    const label = String(field.label ?? "").trim() || "(unlabeled field)";
    const selector = typeof field.selector === "string" && field.selector.trim() ? field.selector.trim() : null;
    const inputType = typeof field.inputType === "string" ? field.inputType.trim().toLowerCase() : (typeof field.type === "string" ? field.type.trim().toLowerCase() : null);
    const context = typeof field.context === "string" && field.context.trim() ? field.context.trim() : null;
    const fieldId = typeof field.fieldId === "string" && field.fieldId.trim()
      ? field.fieldId.trim()
      : fieldIdFor({ selector, label, inputType, context });
    if (seen.has(fieldId)) continue;
    seen.add(fieldId);
    normalized.push({
      fieldId,
      selector,
      label,
      inputType,
      required: Boolean(field.required) || /\*|required/i.test(label),
      category: typeof field.category === "string" && field.category.trim() ? field.category.trim() : "custom",
      status: typeof field.status === "string" ? field.status : null,
      context,
      valuePreview: typeof field.valuePreview === "string" ? field.valuePreview : null,
      decision: null,
      result: null,
      confidence: null,
      memoryMatchId: null,
    });
  }
  return normalized;
}

function fieldHandled(state: AssistantWorkflowState, field: AssistantWorkflowField) {
  const status = field.status?.toLowerCase() ?? "";
  return field.result === "success"
    || field.result === "skipped"
    || status === "filled"
    || status === "checked"
    || state.filledFields.includes(field.fieldId)
    || state.skippedFields.includes(field.fieldId)
    || state.blockedFields.includes(field.fieldId)
    || state.pendingUserRequestId && state.pendingFieldId === field.fieldId;
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

function fieldIdFor(input: { selector?: string | null; label?: string | null; inputType?: string | null; context?: string | null }) {
  return `field_${canonicalKey([input.context, input.selector, input.inputType, input.label].filter(Boolean).join("_"))}`;
}

function canonicalKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "unknown";
}

function hostFromUrl(url: string | null) {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function questionLike(field: AssistantWorkflowField) {
  return /\?|why|describe|explain|tell us|cover letter|interest|experience|project|challenge|contribution/i.test(field.label);
}

function requiresSensitiveApproval(field: AssistantWorkflowField) {
  const descriptor = `${field.category} ${field.label} ${field.context ?? ""}`.toLowerCase();
  return /\b(salary|compensation|pay|wage|bonus|equity|sponsor|sponsorship|visa|authorization|authorized|work permit|legal|attest|certify|convict|felony|criminal|background|clearance|race|ethnic|gender|sex|veteran|disab|orientation|pronoun|religion|age|birth|citizenship|nationality)\b/i.test(descriptor);
}

function fieldsRepresentSameControl(a: AssistantWorkflowField, b: AssistantWorkflowField) {
  if (a.fieldId && b.fieldId && a.fieldId === b.fieldId) return true;
  if (a.selector && b.selector && a.selector === b.selector) return true;
  return canonicalKey(`${a.category} ${a.label}`) === canonicalKey(`${b.category} ${b.label}`);
}

function isWorkflowCommand(value: unknown): value is AssistantWorkflowCommand {
  return Boolean(value && typeof value === "object" && "id" in value && "type" in value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function workflowEventMessage(event: AssistantWorkflowBrowserEvent) {
  if (event.type === "field_inventory") return "Application field inventory received.";
  if (event.type === "field_result") return "Application field command result received.";
  if (event.type === "validation_error") return "Application page reported a validation error.";
  return "Assistant workflow event received.";
}

async function appendWorkflowAction(runId: string, action: { type: string; message: string; at: string }) {
  const run = await prisma.applicationAutomationRun.findUnique({ where: { id: runId } });
  const actions = Array.isArray(run?.actionsJson) ? run.actionsJson : [];
  await prisma.applicationAutomationRun.update({
    where: { id: runId },
    data: { actionsJson: [...actions, action] as Prisma.InputJsonValue },
  });
}

async function markApplicationSubmitted(applicationId: string, automationRunId: string, note: string) {
  const existing = await prisma.applicationOutcome.findFirst({
    where: { applicationId, outcome: "APPLIED" },
  }).catch(() => null);
  if (!existing) {
    await recordApplicationOutcome({
      applicationId,
      outcome: "APPLIED",
      notes: note,
      source: "assistant_state",
    }).catch(async () => {
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "applied", appliedAt: new Date() },
      }).catch(() => null);
    });
  }
  await prisma.applicationAutomationRun.update({
    where: { id: automationRunId },
    data: {
      status: "SUBMITTED",
      blockerType: null,
      blockerMessage: null,
      finishedAt: new Date(),
    },
  }).catch(() => null);
  await prisma.agentUserRequest.updateMany({
    where: { applicationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  }).catch(() => null);
  await prisma.applicationEvent.create({
    data: {
      applicationId,
      type: "applied",
      payload: { source: "application_assistant_workflow", automationRunId, note } as Prisma.InputJsonValue,
    },
  }).catch(() => null);
  await reconcileApplicationCanonicalState({
    applicationId,
    source: "assistant_submit_lifecycle",
  }).catch(() => null);
}

async function markAssistantClosedWithoutSubmit(
  run: Awaited<ReturnType<typeof latestWorkflowRun>>,
  message: string,
) {
  const blockerType = "assistant_closed";
  const blockerMessage = message || "Assistant browser closed before submit.";
  await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      status: "NEEDS_USER",
      blockerType,
      blockerMessage,
      finishedAt: new Date(),
    },
  }).catch(() => null);
  const existing = await prisma.agentUserRequest.findFirst({
    where: {
      applicationId: run.applicationId,
      type: "APPLICATION_BLOCKED",
      status: "OPEN",
    },
  }).catch(() => null);
  if (!existing) {
    await createAgentUserRequest({
      userId: run.userId,
      applicationId: run.applicationId,
      jobPostingId: run.jobPostingId,
      type: "APPLICATION_BLOCKED",
      question: blockerMessage,
      contextJson: {
        blockerType,
        source: "assistant_browser_lifecycle",
        automationRunId: run.id,
      } as Prisma.InputJsonValue,
    }).catch(() => null);
  }
  await createQualityExampleFromAutomationRun(run.id, "AUTOMATION_RUN").catch(() => null);
}

function safeSubmitIntent(intent: AssistantWorkflowBrowserEvent["submitIntent"]) {
  if (!intent) return null;
  return {
    at: intent.at ?? null,
    source: intent.source ?? null,
    descriptor: intent.descriptor?.slice(0, 240) ?? null,
    url: intent.url ?? null,
  };
}
