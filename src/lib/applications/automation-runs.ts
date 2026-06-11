import type { ApplicationAutomationRun, ApplicationAutomationRunStatus, AtsProvider, Prisma } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { langSmithTraceMetadata, traceWorkflowStep } from "@/lib/observability/langsmith";
import { refreshOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { createQualityExampleFromAutomationRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

type AssistantLogClassification = {
  status: ApplicationAutomationRunStatus;
  blockerType?: string | null;
  blockerMessage?: string | null;
};

export type AssistantRunTimelineItem = {
  type: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  at?: string | null;
  detail?: string | null;
};

export type AssistantRunDiagnostics = {
  phase: "launching" | "opening_page" | "detecting_fields" | "filling" | "uploading" | "learning" | "waiting_for_review" | "blocked" | "closed" | "failed" | "submitted";
  severity: "info" | "success" | "warning" | "error";
  status: ApplicationAutomationRunStatus | "NO_LOG";
  statusLabel: string;
  summary: string;
  reason: string | null;
  nextAction: string;
  currentAction: string;
  blockerType: string | null;
  lastEventType: string | null;
  lastEventMessage: string | null;
  counts: {
    detected: number | null;
    filled: number | null;
    learned: number | null;
    uploaded: number | null;
    skipped: number | null;
    observed: number | null;
  };
  pid?: number | null;
  logPath?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
};

const defaultStaleRunMinutes = 90;
const assistantClosedBlockerType = "assistant_closed";
const assistantClosedBlockerMessage =
  "The assistant browser was closed or stopped before submission. Relaunch the assistant or mark the application applied if you submitted manually.";

const blockerPatterns: Array<{ type: string; pattern: RegExp; message: string }> = [
  { type: "ats_spam_block", pattern: /we couldn.?t submit your application|possible spam|flagged as possible spam|google.?s recaptcha technology|to protect against spam and bots/i, message: "Ashby blocked submission as possible spam or reCAPTCHA risk. Retry through normal Chrome assisted fill and submit manually." },
  { type: "closed_job", pattern: /closed|removed|unavailable|no form can be filled/i, message: "The application page appears closed, removed, or unavailable." },
  { type: "manual_handoff", pattern: /captcha|human verification|manual review is needed before continuing|continue in browser|assistant paused/i, message: "Assistant paused." },
  { type: "login_block", pattern: /sign-in blocked|complete login|login/i, message: "The application requires login or account access." },
  { type: "manual_handoff", pattern: /manual handling|normal browser|handing off/i, message: "The assistant handed this application off for manual browser handling." },
  { type: "no_fields", pattern: /No fillable application fields|No fillable.*found/i, message: "The assistant could not find fillable application fields." },
];

const safePatternCategories = new Set([
  "cover_letter",
  "email",
  "first_name",
  "full_name",
  "github_url",
  "last_name",
  "linkedin_url",
  "location",
  "phone",
  "portfolio_url",
  "resume",
]);

export async function createApplicationAutomationRun(input: {
  userId: string;
  applicationId: string;
  jobPostingId: string;
  currentUrl?: string | null;
  logPath?: string | null;
  pid?: number | null;
  actionsJson?: Prisma.InputJsonValue;
}) {
  return prisma.applicationAutomationRun.create({
    data: {
      userId: input.userId,
      applicationId: input.applicationId,
      jobPostingId: input.jobPostingId,
      currentUrl: input.currentUrl ?? null,
      logPath: input.logPath ?? null,
      pid: input.pid ?? null,
      actionsJson: input.actionsJson ?? [],
      observabilityJson: langSmithTraceMetadata(),
    },
  });
}

export async function updateApplicationAutomationRunFromLog(input: {
  applicationId: string;
  logPath: string;
  log: string;
}) {
  const run = await prisma.applicationAutomationRun.findFirst({
    where: {
      applicationId: input.applicationId,
      logPath: input.logPath,
    },
    include: {
      jobPosting: { select: { atsProvider: true, applicationUrl: true } },
    },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;

  const classification = classifyAssistantLog(input.log);
  const actions = assistantLogActions(input.log);
  const screenshots = assistantLogScreenshots(input.log);
  if (classification.status === "RUNNING") {
    const recoveredRun = await recoverStaleAutomationRun(run, {
      actions,
      screenshots,
      logPath: input.logPath,
    });
    if (recoveredRun) return recoveredRun;
  }

  const finished = classification.status !== "RUNNING";
  await persistFormPatternsFromLog({
    userId: run.userId,
    atsProvider: run.jobPosting.atsProvider,
    host: hostFromUrl(run.currentUrl ?? run.jobPosting.applicationUrl),
    log: input.log,
    success: classification.status === "READY_TO_SUBMIT" || classification.status === "SUBMITTED",
  });

  const updatedRun = await traceWorkflowStep(
    "assistant.log_sync",
    {
      applicationId: run.applicationId,
      automationRunId: run.id,
      previousStatus: run.status,
      nextStatus: classification.status,
      blockerType: classification.blockerType ?? null,
      actionCount: actions.length,
      screenshotCount: screenshots.length,
    },
    () => prisma.applicationAutomationRun.update({
      where: { id: run.id },
      data: {
        status: classification.status,
        ...workflowUpdateFromLog(run, classification, actions),
        blockerType: classification.blockerType ?? null,
        blockerMessage: classification.blockerMessage ?? null,
        finishedAt: finished ? run.finishedAt ?? new Date() : null,
        actionsJson: actions as Prisma.InputJsonValue,
        screenshotsJson: screenshots as Prisma.InputJsonValue,
        observabilityJson: {
          ...(langSmithTraceMetadata() as Record<string, unknown>),
          lastTraceStep: "assistant.log_sync",
          lastStatus: classification.status,
        } as Prisma.InputJsonValue,
      },
    }),
  );

  if (run.status !== classification.status && classification.status !== "RUNNING") {
    await prisma.applicationEvent.create({
      data: {
        applicationId: run.applicationId,
        type: classification.status === "SUBMITTED" ? "applied" : "note_added",
        payload: buildAutomationRunEventPayload({
          automationRunId: run.id,
          status: classification.status,
          blockerType: classification.blockerType ?? null,
          blockerMessage: classification.blockerMessage ?? null,
          actionCount: actions.length,
          screenshotCount: screenshots.length,
          logPath: input.logPath,
        }),
      },
    });
  }
  if (classification.status !== "RUNNING") {
    await createQualityExampleFromAutomationRun(run.id, "AUTOMATION_RUN").catch(() => null);
    refreshOutcomeCalibration({ userId: run.userId, source: "assistant_state" });
  }

  return updatedRun;
}

function workflowUpdateFromLog(
  run: ApplicationAutomationRun,
  classification: AssistantLogClassification,
  actions: Array<{ type: string; message: string }>,
): Prisma.ApplicationAutomationRunUpdateInput {
  if (!run.graphThreadId) return {};
  const currentState = run.workflowStateJson && typeof run.workflowStateJson === "object" && !Array.isArray(run.workflowStateJson)
    ? run.workflowStateJson as { events?: Array<{ type: string; message: string; at: string }>; [key: string]: unknown }
    : {};
  const currentNode = nodeForAssistantStatus(classification.status);
  const existingEvents = Array.isArray(currentState.events) ? currentState.events : [];
  const actionEvents = actions.map((action) => ({
    type: action.type,
    message: action.message,
    at: new Date().toISOString(),
  }));
  const statusChanged = run.status !== classification.status || run.currentNode !== currentNode;
  const events = statusChanged
    ? [
        ...existingEvents,
        ...actionEvents,
        {
          type: currentNode,
          message: workflowMessageForStatus(classification),
          at: new Date().toISOString(),
        },
      ]
    : existingEvents;
  return {
    currentNode,
    workflowStateJson: {
      ...currentState,
      automationRunId: run.id,
      applicationId: run.applicationId,
      graphThreadId: run.graphThreadId,
      currentNode,
      status: classification.status,
      blockerType: classification.blockerType ?? null,
      blockerMessage: classification.blockerMessage ?? null,
      events,
    } as Prisma.InputJsonValue,
  };
}

function nodeForAssistantStatus(status: ApplicationAutomationRunStatus) {
  if (status === "SUBMITTED") return "detectSubmitOrClose";
  if (status === "READY_TO_SUBMIT") return "readyForSubmit";
  if (status === "BLOCKED" || status === "NEEDS_USER") return "pauseForUser";
  if (status === "FAILED") return "finalizeRun";
  return "fillKnownFields";
}

function workflowMessageForStatus(classification: AssistantLogClassification) {
  if (classification.status === "SUBMITTED") return "Submission confirmation detected and application state is being updated.";
  if (classification.status === "READY_TO_SUBMIT") return "Assistant filled known fields and is waiting for manual review before submit.";
  if (classification.status === "BLOCKED" || classification.status === "NEEDS_USER") return classification.blockerMessage ?? "Assistant needs user input before it can continue.";
  if (classification.status === "FAILED") return classification.blockerMessage ?? "Assistant workflow failed.";
  return "Assistant is inspecting and filling the application form.";
}

export async function recoverStaleApplicationAutomationRuns(applicationId?: string) {
  const runs = await prisma.applicationAutomationRun.findMany({
    where: {
      status: "RUNNING",
      ...(applicationId ? { applicationId } : {}),
    },
    orderBy: { startedAt: "asc" },
    take: 100,
  });

  let recovered = 0;
  for (const run of runs) {
    const updated = await recoverStaleAutomationRun(run, {
      actions: [],
      screenshots: [],
      logPath: run.logPath,
    });
    if (updated) recovered += 1;
  }
  return { recovered };
}

export async function syncRunningApplicationAutomationRunsFromLogs(applicationId?: string) {
  const runs = await prisma.applicationAutomationRun.findMany({
    where: {
      status: "RUNNING",
      logPath: { not: null },
      ...(applicationId ? { applicationId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  let synced = 0;
  for (const run of runs) {
    const log = readAssistantLog(run.logPath);
    if (log === null) continue;
    const updated = await updateApplicationAutomationRunFromLog({
      applicationId: run.applicationId,
      logPath: run.logPath ?? "",
      log,
    });
    if (updated?.status !== "RUNNING") synced += 1;
  }
  return { synced };
}

export function shouldRecoverRunningAutomationRun(
  run: Pick<ApplicationAutomationRun, "status" | "pid" | "startedAt">,
  options: { now?: Date; staleMinutes?: number; processAlive?: (pid: number) => boolean } = {},
) {
  if (run.status !== "RUNNING") return false;
  const staleMinutes = options.staleMinutes ?? assistantStaleRunMinutes();
  const now = options.now ?? new Date();
  const isStale = now.getTime() - run.startedAt.getTime() >= staleMinutes * 60_000;
  const processIsMissing = run.pid ? !(options.processAlive ?? assistantProcessIsAlive)(run.pid) : false;
  return isStale || processIsMissing;
}

function assistantStaleRunMinutes() {
  const configured = Number(process.env.ASSISTANT_STALE_RUN_MINUTES);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultStaleRunMinutes;
}

function assistantProcessIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function recoverStaleAutomationRun(
  run: ApplicationAutomationRun,
  input: {
    actions: Array<{ type: string; message: string }>;
    screenshots: Array<{ type: string; path: string; textPath?: string; summary?: string }>;
    logPath?: string | null;
  },
) {
  if (!shouldRecoverRunningAutomationRun(run)) return null;

  const actions = [
    ...input.actions,
    {
      type: assistantClosedBlockerType,
      message: assistantClosedBlockerMessage,
    },
  ];
  const updatedRun = await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      status: "NEEDS_USER",
      blockerType: assistantClosedBlockerType,
      blockerMessage: assistantClosedBlockerMessage,
      finishedAt: run.finishedAt ?? new Date(),
      actionsJson: actions as Prisma.InputJsonValue,
      screenshotsJson: input.screenshots as Prisma.InputJsonValue,
    },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: run.applicationId,
      type: "note_added",
      payload: buildAutomationRunEventPayload({
        automationRunId: run.id,
        status: "NEEDS_USER",
        blockerType: assistantClosedBlockerType,
        blockerMessage: assistantClosedBlockerMessage,
        actionCount: actions.length,
        screenshotCount: input.screenshots.length,
        logPath: input.logPath,
      }),
    },
  });
  await createQualityExampleFromAutomationRun(run.id, "AUTOMATION_RUN").catch(() => null);
  refreshOutcomeCalibration({ userId: run.userId, source: "assistant_state" });

  return updatedRun;
}

export function buildAutomationRunEventPayload(input: {
  automationRunId: string;
  status: ApplicationAutomationRunStatus;
  blockerType?: string | null;
  blockerMessage?: string | null;
  actionCount: number;
  screenshotCount: number;
  logPath?: string | null;
}): Prisma.InputJsonValue {
  return {
    source: "application_automation_run",
    automationRunId: input.automationRunId,
    status: input.status,
    blockerType: input.blockerType ?? null,
    blockerMessage: input.blockerMessage ?? null,
    actionCount: input.actionCount,
    screenshotCount: input.screenshotCount,
    logPath: input.logPath ?? null,
  };
}

export async function persistFormPatternsFromLog(input: {
  userId: string;
  atsProvider: AtsProvider;
  host: string;
  log: string;
  success: boolean;
}) {
  const patterns = assistantLogFieldPatterns(input.log);
  if (!patterns.length) return { count: 0 };
  let count = 0;
  for (const pattern of patterns) {
    await prisma.applicationFormPattern.upsert({
      where: {
        userId_host_fieldKey_category: {
          userId: input.userId,
          host: input.host,
          fieldKey: pattern.fieldKey,
          category: pattern.category,
        },
      },
      create: {
        userId: input.userId,
        atsProvider: input.atsProvider,
        host: input.host,
        fieldKey: pattern.fieldKey,
        category: pattern.category,
        label: pattern.label,
        inputType: pattern.inputType,
        selector: pattern.selector,
        successCount: input.success ? 1 : 0,
        failureCount: input.success ? 0 : 1,
        metadataJson: { source: "playwright_assistant_log" },
      },
      update: {
        atsProvider: input.atsProvider,
        label: pattern.label,
        inputType: pattern.inputType,
        selector: pattern.selector,
        successCount: input.success ? { increment: 1 } : undefined,
        failureCount: input.success ? undefined : { increment: 1 },
        lastSeenAt: new Date(),
        metadataJson: { source: "playwright_assistant_log" },
      },
    });
    count += 1;
  }
  return { count };
}

export function classifyAssistantLog(log: string): AssistantLogClassification {
  if (!log.trim()) return { status: "RUNNING" };
  if (/Manual submit (button click|confirmation) detected|Browser closed after manual submit click|Tracker updated:.*Application marked applied/i.test(log)) {
    return { status: "SUBMITTED" };
  }

  if (/Assistant browser\/page closed before a submission confirmation was observed/i.test(log)) {
    return {
      status: "NEEDS_USER",
      blockerType: assistantClosedBlockerType,
      blockerMessage: assistantClosedBlockerMessage,
    };
  }

  if (/Traceback|Unable to load assistant package|Playwright is not installed|Assistant launch failed/i.test(log)) {
    if (/Review every field in the browser\. Submit manually only if everything is correct|ready_for_manual_submit/i.test(log) && /Frame was detached|Target page, context or browser has been closed|Browser has been closed/i.test(log)) {
      return {
        status: "NEEDS_USER",
        blockerType: assistantClosedBlockerType,
        blockerMessage: assistantClosedBlockerMessage,
      };
    }
    return { status: "FAILED", blockerType: "assistant_error", blockerMessage: "The assistant run failed before completing." };
  }

  if (/Auto-submit skipped/i.test(log)) {
    return { status: "READY_TO_SUBMIT", blockerType: "auto_submit_skipped", blockerMessage: "Auto-submit was skipped by a page-level safety check." };
  }

  const blocker = blockerPatterns.find((item) => item.pattern.test(log));
  if (blocker) return { status: "BLOCKED", blockerType: blocker.type, blockerMessage: blocker.message };

  if (/Review every field in the browser\. Submit manually only if everything is correct/i.test(log)) {
    return { status: "READY_TO_SUBMIT" };
  }
  if (/Auto-submit (clicked|confirmed) after safety checks passed/i.test(log)) {
    return { status: "SUBMITTED" };
  }

  return { status: "RUNNING" };
}

export function buildAssistantRunFeedback(input: {
  log: string;
  run?: {
    status?: ApplicationAutomationRunStatus | string | null;
    blockerType?: string | null;
    blockerMessage?: string | null;
    currentNode?: string | null;
    workflowStateJson?: Prisma.JsonValue | null;
    actionsJson?: Prisma.JsonValue | null;
    pid?: number | null;
    logPath?: string | null;
    startedAt?: Date | string | null;
    finishedAt?: Date | string | null;
  } | null;
}): { diagnostics: AssistantRunDiagnostics; timeline: AssistantRunTimelineItem[] } {
  const classification = classifyAssistantLog(input.log);
  const runStatus = input.run?.status ?? null;
  const effectiveStatus = runStatus && runStatus !== "RUNNING" ? String(runStatus) as ApplicationAutomationRunStatus : classification.status;
  const blockerType = input.run?.blockerType ?? classification.blockerType ?? null;
  const blockerMessage = input.run?.blockerMessage ?? classification.blockerMessage ?? null;
  const structuredEvents = assistantStructuredEvents(input.log);
  const workflowEvents = workflowTimelineEvents(input.run?.workflowStateJson);
  const actionEvents = actionTimelineEvents(input.run?.actionsJson);
  const timeline = normalizeTimeline([
    ...actionEvents,
    ...structuredEvents.map((event) => ({
      type: event.type,
      message: event.message,
      at: event.at ?? null,
      severity: severityForEvent(event.type, event.message),
      detail: detailFromPayload(event.payload),
    })),
    ...assistantLogActions(input.log).map((action) => ({
      type: action.type,
      message: action.message,
      at: null,
      severity: severityForEvent(action.type, action.message),
      detail: null,
    })),
    ...workflowEvents,
  ]);
  const lastEvent = timeline.at(-1) ?? null;
  const counts = assistantRunCounts(input.log, input.run?.workflowStateJson);
  const phase = phaseForAssistantRun({
    status: effectiveStatus,
    lastEventType: lastEvent?.type ?? null,
    blockerType,
    currentNode: input.run?.currentNode ?? null,
    log: input.log,
  });
  const severity = severityForPhase(phase, effectiveStatus);
  const reason = reasonForAssistantRun({
    status: effectiveStatus,
    blockerType,
    blockerMessage,
    log: input.log,
  });
  const startedAt = isoDate(input.run?.startedAt);
  const finishedAt = isoDate(input.run?.finishedAt);

  return {
    diagnostics: {
      phase,
      severity,
      status: input.log.trim() ? effectiveStatus : "NO_LOG",
      statusLabel: statusLabel(effectiveStatus, phase),
      summary: summaryForPhase(phase, effectiveStatus, lastEvent?.message ?? null),
      reason,
      nextAction: nextActionForAssistantRun({ status: effectiveStatus, phase, blockerType }),
      currentAction: currentActionForPhase(phase, lastEvent?.message ?? null),
      blockerType,
      lastEventType: lastEvent?.type ?? null,
      lastEventMessage: lastEvent?.message ?? null,
      counts,
      pid: input.run?.pid ?? null,
      logPath: input.run?.logPath ?? null,
      startedAt,
      finishedAt,
      durationSeconds: durationSeconds(startedAt, finishedAt),
    },
    timeline,
  };
}

function readAssistantLog(logPath?: string | null) {
  if (!logPath) return null;
  const logRoot = path.join(process.cwd(), ".assistant-logs");
  const resolved = path.resolve(logPath);
  if (!resolved.startsWith(logRoot)) return null;
  return existsSync(resolved) ? readFileSync(resolved, "utf8") : "";
}

export function assistantLogActions(log: string) {
  const actions: Array<{ type: string; message: string }> = [];
  for (const event of assistantStructuredEvents(log)) {
    actions.push({ type: event.type, message: event.message });
  }
  const filled = /Filled (\d+) safe text fields\./i.exec(log);
  const demographic = /Filled (\d+) configured demographic field/i.exec(log);
  const uploads = /Uploaded (\d+) material file/i.exec(log);

  if (filled) actions.push({ type: "filled_safe_fields", message: `${filled[1]} safe text fields filled.` });
  if (demographic) actions.push({ type: "filled_demographic_fields", message: `${demographic[1]} configured demographic fields filled.` });
  if (uploads) actions.push({ type: "uploaded_materials", message: `${uploads[1]} material files uploaded.` });
  if (/Selected application answers:/i.test(log)) actions.push({ type: "prepared_selected_answers", message: "Selected custom-answer drafts were prepared." });

  return actions;
}

function assistantStructuredEvents(log: string) {
  const events: Array<{ type: string; message: string; at?: string | null; payload?: Record<string, unknown> | null }> = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("ASSISTANT_EVENT ")) continue;
    try {
      const event = JSON.parse(line.slice("ASSISTANT_EVENT ".length)) as { type?: string; message?: string; at?: string | null; payload?: Record<string, unknown> | null };
      if (event.type && event.message) events.push({ type: event.type, message: event.message, at: event.at ?? null, payload: event.payload ?? null });
    } catch {
      continue;
    }
  }
  return events;
}

function workflowTimelineEvents(value?: Prisma.JsonValue | null): AssistantRunTimelineItem[] {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value as { events?: unknown } : {};
  if (!Array.isArray(state.events)) return [];
  return state.events
    .filter((event): event is { type?: string; message?: string; at?: string | null } => Boolean(event && typeof event === "object"))
    .map((event) => ({
      type: String(event.type ?? "workflow_event"),
      message: String(event.message ?? "Assistant workflow event."),
      at: typeof event.at === "string" ? event.at : null,
      severity: severityForEvent(String(event.type ?? ""), String(event.message ?? "")),
      detail: null,
    }));
}

function actionTimelineEvents(value?: Prisma.JsonValue | null): AssistantRunTimelineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((action): action is { type?: string; message?: string; at?: string | null } => Boolean(action && typeof action === "object"))
    .map((action) => ({
      type: String(action.type ?? "assistant_action"),
      message: String(action.message ?? "Assistant action recorded."),
      at: typeof action.at === "string" ? action.at : null,
      severity: severityForEvent(String(action.type ?? ""), String(action.message ?? "")),
      detail: null,
    }));
}

function normalizeTimeline(items: AssistantRunTimelineItem[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => item.message.trim())
    .filter((item) => {
      const key = `${item.type}:${item.message}:${item.at ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      if (!left.at && !right.at) return 0;
      if (!left.at) return -1;
      if (!right.at) return 1;
      return new Date(left.at).getTime() - new Date(right.at).getTime();
    })
    .slice(-30);
}

function detailFromPayload(payload?: Record<string, unknown> | null) {
  if (!payload) return null;
  const details = [
    typeof payload.url === "string" ? payload.url : null,
    typeof payload.blockerType === "string" ? `Blocker: ${payload.blockerType}` : null,
    typeof payload.safeRetry === "string" ? `Retry: ${payload.safeRetry}` : null,
    typeof payload.closeReason === "string" ? `Close: ${payload.closeReason}` : null,
  ].filter(Boolean);
  return details.length ? details.join(" · ") : null;
}

function assistantRunCounts(log: string, workflowState?: Prisma.JsonValue | null): AssistantRunDiagnostics["counts"] {
  const detected = lastNumber(log, /Detected (\d+) application field/i);
  const safeFilled = lastNumber(log, /Filled (\d+) safe text fields/i) ?? 0;
  const learnedFilled = lastNumber(log, /Filled (\d+) learned recurring field/i) ?? 0;
  const memoryFilled = lastNumber(log, /Filled (\d+) saved field memory value/i) ?? 0;
  const demographicFilled = lastNumber(log, /Filled (\d+) configured demographic field/i) ?? 0;
  const uploaded = lastNumber(log, /Uploaded (\d+) material file/i);
  const learned = lastNumber(log, /Field learning updated: saved (\d+)/i);
  const workflowCounts = workflowCountsFromState(workflowState);
  return {
    detected: workflowCounts.detected ?? detected,
    filled: workflowCounts.filled ?? nonZeroOrNull(safeFilled + learnedFilled + memoryFilled + demographicFilled),
    learned,
    uploaded,
    skipped: workflowCounts.skipped,
    observed: workflowCounts.observed,
  };
}

function workflowCountsFromState(value?: Prisma.JsonValue | null) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const counts = state.counts && typeof state.counts === "object" && !Array.isArray(state.counts) ? state.counts as Record<string, unknown> : {};
  return {
    detected: numberValue(counts.detected),
    filled: numberValue(counts.filled),
    skipped: numberValue(counts.skipped),
    observed: numberValue(counts.observed),
  };
}

function lastNumber(value: string, pattern: RegExp) {
  let latest: number | null = null;
  for (const match of value.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) latest = parsed;
  }
  return latest;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonZeroOrNull(value: number) {
  return value > 0 ? value : null;
}

function phaseForAssistantRun(input: {
  status: ApplicationAutomationRunStatus;
  lastEventType: string | null;
  blockerType: string | null;
  currentNode: string | null;
  log: string;
}): AssistantRunDiagnostics["phase"] {
  if (!input.log.trim()) return "launching";
  if (input.status === "SUBMITTED") return "submitted";
  if (input.status === "FAILED") return "failed";
  if (input.blockerType === assistantClosedBlockerType) return "closed";
  if (input.status === "BLOCKED" || input.status === "NEEDS_USER") return "blocked";
  if (input.status === "READY_TO_SUBMIT") return "waiting_for_review";
  if (input.currentNode === "observeManualInput" || input.lastEventType === "learning_mode" || input.lastEventType === "manual_input_observed") return "learning";
  if (input.lastEventType === "page_opened") return "opening_page";
  if (input.lastEventType === "fields_detected" || input.lastEventType === "field_inventory") return "detecting_fields";
  if (input.lastEventType === "fill_summary" || /Filled \d+|Uploaded \d+/i.test(input.log)) return "filling";
  return "launching";
}

function severityForPhase(phase: AssistantRunDiagnostics["phase"], status: ApplicationAutomationRunStatus) {
  if (phase === "failed") return "error";
  if (phase === "blocked" || phase === "closed") return "warning";
  if (phase === "submitted" || phase === "waiting_for_review") return "success";
  if (status === "FAILED") return "error";
  return "info";
}

function severityForEvent(type: string, message: string): AssistantRunTimelineItem["severity"] {
  const value = `${type} ${message}`.toLowerCase();
  if (/failed|traceback|error/.test(value)) return "error";
  if (/blocked|closed|captcha|login|manual_handoff|needs_user|paused|unavailable|spam/.test(value)) return "warning";
  if (/submitted|ready_for_manual_submit|readyforsubmit|success|filled|uploaded|learning|observed/.test(value)) return "success";
  return "info";
}

function reasonForAssistantRun(input: {
  status: ApplicationAutomationRunStatus;
  blockerType: string | null;
  blockerMessage: string | null;
  log: string;
}) {
  if (/Unable to load assistant package/i.test(input.log)) return "The assistant could not load the prepared application package.";
  if (/Playwright is not installed/i.test(input.log)) return "Python Playwright is not installed for the local assistant.";
  if (/Browser profile was locked/i.test(input.log)) return "The configured Chrome profile was already locked, so the assistant retried with a temporary profile.";
  if (/Traceback/i.test(input.log)) return "The assistant hit a runtime error. Open the raw log for the stack trace.";
  if (input.blockerMessage) return input.blockerMessage;
  if (input.blockerType === assistantClosedBlockerType) return assistantClosedBlockerMessage;
  if (input.status === "READY_TO_SUBMIT") return "The assistant stopped before final submit so you can review the employer form.";
  return null;
}

function nextActionForAssistantRun(input: {
  status: ApplicationAutomationRunStatus;
  phase: AssistantRunDiagnostics["phase"];
  blockerType: string | null;
}) {
  if (input.status === "SUBMITTED") return "No action needed unless the employer page shows a different outcome.";
  if (input.phase === "waiting_for_review") return "Review the browser form, submit manually, then mark the application applied if needed.";
  if (input.blockerType === "closed_job") return "Reject this application as Job unavailable.";
  if (input.blockerType === "ats_spam_block") return "Retry in your normal Chrome profile with the extension, then submit manually.";
  if (input.blockerType === "login_block" || input.blockerType === "manual_handoff") return "Complete the verification or login manually, then use assisted fill if the form is visible.";
  if (input.blockerType === assistantClosedBlockerType) return "Relaunch the assistant, or mark applied if you submitted before the browser closed.";
  if (input.status === "FAILED") return "Inspect the raw log, fix the setup issue, then relaunch.";
  if (input.phase === "learning") return "Complete the unknown field in the browser; the assistant will learn it for future forms.";
  return "Wait for the next event, or refresh the run if the browser is no longer open.";
}

function currentActionForPhase(phase: AssistantRunDiagnostics["phase"], lastEventMessage: string | null) {
  if (lastEventMessage) return lastEventMessage;
  const fallback: Record<AssistantRunDiagnostics["phase"], string> = {
    launching: "Starting the local browser assistant.",
    opening_page: "Opening the employer application page.",
    detecting_fields: "Scanning the application form fields.",
    filling: "Filling known fields and uploading prepared materials.",
    uploading: "Uploading generated materials.",
    learning: "Waiting for manual input so it can learn this field.",
    waiting_for_review: "Waiting for your final review and manual submit.",
    blocked: "Paused on a blocker.",
    closed: "Browser session closed before submit confirmation.",
    failed: "Assistant run failed before completion.",
    submitted: "Submission was detected.",
  };
  return fallback[phase];
}

function summaryForPhase(phase: AssistantRunDiagnostics["phase"], status: ApplicationAutomationRunStatus, lastEventMessage: string | null) {
  if (phase === "closed") return "The assistant browser closed before it saw a submit confirmation.";
  if (phase === "blocked") return "The assistant paused because it found a blocker.";
  if (phase === "failed") return "The assistant run failed before completing.";
  if (phase === "submitted") return "The assistant detected submission activity.";
  if (phase === "waiting_for_review") return "The assistant is ready for your manual review.";
  if (phase === "learning") return "The assistant is learning from how you complete the form.";
  if (status === "RUNNING" && lastEventMessage) return lastEventMessage;
  return "The assistant run is in progress.";
}

function statusLabel(status: ApplicationAutomationRunStatus, phase: AssistantRunDiagnostics["phase"]) {
  if (phase === "closed") return "Closed before submit";
  if (phase === "learning") return "Learning";
  return status.replace(/_/g, " ").toLowerCase();
}

function isoDate(value?: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function durationSeconds(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

export function assistantLogFieldPatterns(log: string) {
  const seen = new Set<string>();
  const patterns: Array<{
    category: string;
    fieldKey: string;
    inputType?: string;
    label: string;
    selector?: string;
  }> = [];

  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("- ") || !line.includes(" | ")) continue;
    const parts = line.slice(2).split("|").map((part) => part.trim()).filter(Boolean);
    const categoryMatch = /^([^:]+):/.exec(parts[0] ?? "");
    if (!categoryMatch) continue;
    const category = categoryMatch[1].trim();
    if (!safePatternCategories.has(category)) continue;
    const inputType = parts[1]?.replace(/\s+/g, " ").trim() || undefined;
    const selectorPart = parts.find((part) => part.startsWith("selector:"));
    const selector = selectorPart?.replace(/^selector:\s*/i, "").trim() || undefined;
    const label = parts[parts.length - 1]?.trim();
    if (!label || label === "(unlabeled field)") continue;
    const fieldKey = canonicalFieldKey(selector ?? label);
    const dedupeKey = `${category}:${fieldKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    patterns.push({ category, fieldKey, inputType, label: label.slice(0, 240), selector });
  }

  return patterns;
}

function canonicalFieldKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "field";
}

function hostFromUrl(url?: string | null) {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function assistantLogScreenshots(log: string) {
  const screenshots: Array<{ type: string; path: string; textPath?: string; summary?: string }> = [];
  const screenshotMatch = /Submit confirmation screenshot:\s*(.+)$/im.exec(log);
  if (!screenshotMatch) return screenshots;

  const textMatch = /Submit confirmation text:\s*(.+)$/im.exec(log);
  const summaryMatch = /Submit confirmation summary:\s*(.+)$/im.exec(log);
  screenshots.push({
    type: "submit_confirmation",
    path: screenshotMatch[1].trim(),
    ...(textMatch ? { textPath: textMatch[1].trim() } : {}),
    ...(summaryMatch ? { summary: summaryMatch[1].trim() } : {}),
  });
  return screenshots;
}
