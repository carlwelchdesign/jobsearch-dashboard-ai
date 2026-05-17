import type { ApplicationAutomationRun, ApplicationAutomationRunStatus, AtsProvider, Prisma } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

type AssistantLogClassification = {
  status: ApplicationAutomationRunStatus;
  blockerType?: string | null;
  blockerMessage?: string | null;
};

const defaultStaleRunMinutes = 90;
const assistantClosedBlockerType = "assistant_closed";
const assistantClosedBlockerMessage =
  "The assistant browser was closed or stopped before submission. Relaunch the assistant or mark the application applied if you submitted manually.";

const blockerPatterns: Array<{ type: string; pattern: RegExp; message: string }> = [
  { type: "closed_job", pattern: /closed|removed|unavailable|no form can be filled/i, message: "The application page appears closed, removed, or unavailable." },
  { type: "captcha", pattern: /captcha|human verification/i, message: "The application page requires CAPTCHA or human verification." },
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

  const updatedRun = await prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      status: classification.status,
      ...workflowUpdateFromLog(run, classification, actions),
      blockerType: classification.blockerType ?? null,
      blockerMessage: classification.blockerMessage ?? null,
      finishedAt: finished ? run.finishedAt ?? new Date() : null,
      actionsJson: actions as Prisma.InputJsonValue,
      screenshotsJson: screenshots as Prisma.InputJsonValue,
    },
  });

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
  if (/Traceback|Unable to load assistant package|Playwright is not installed|Assistant launch failed/i.test(log)) {
    return { status: "FAILED", blockerType: "assistant_error", blockerMessage: "The assistant run failed before completing." };
  }

  if (/Manual submit (button click|confirmation) detected|Tracker updated:.*Application marked applied/i.test(log)) {
    return { status: "SUBMITTED" };
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
  const events: Array<{ type: string; message: string }> = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("ASSISTANT_EVENT ")) continue;
    try {
      const event = JSON.parse(line.slice("ASSISTANT_EVENT ".length)) as { type?: string; message?: string };
      if (event.type && event.message) events.push({ type: event.type, message: event.message });
    } catch {
      continue;
    }
  }
  return events;
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
