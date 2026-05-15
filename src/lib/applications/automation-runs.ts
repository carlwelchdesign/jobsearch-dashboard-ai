import type { ApplicationAutomationRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AssistantLogClassification = {
  status: ApplicationAutomationRunStatus;
  blockerType?: string | null;
  blockerMessage?: string | null;
};

const blockerPatterns: Array<{ type: string; pattern: RegExp; message: string }> = [
  { type: "closed_job", pattern: /closed|removed|unavailable|no form can be filled/i, message: "The application page appears closed, removed, or unavailable." },
  { type: "captcha", pattern: /captcha|human verification/i, message: "The application page requires CAPTCHA or human verification." },
  { type: "login_block", pattern: /sign-in blocked|complete login|login/i, message: "The application requires login or account access." },
  { type: "manual_handoff", pattern: /manual handling|normal browser|handing off/i, message: "The assistant handed this application off for manual browser handling." },
  { type: "no_fields", pattern: /No fillable application fields|No fillable.*found/i, message: "The assistant could not find fillable application fields." },
];

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
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;

  const classification = classifyAssistantLog(input.log);
  const finished = classification.status !== "RUNNING";

  return prisma.applicationAutomationRun.update({
    where: { id: run.id },
    data: {
      status: classification.status,
      blockerType: classification.blockerType ?? null,
      blockerMessage: classification.blockerMessage ?? null,
      finishedAt: finished ? run.finishedAt ?? new Date() : null,
      actionsJson: assistantLogActions(input.log) as Prisma.InputJsonValue,
      screenshotsJson: assistantLogScreenshots(input.log) as Prisma.InputJsonValue,
    },
  });
}

export function classifyAssistantLog(log: string): AssistantLogClassification {
  if (!log.trim()) return { status: "RUNNING" };
  if (/Traceback|Unable to load assistant package|Playwright is not installed|Assistant launch failed/i.test(log)) {
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
  if (/Auto-submit clicked after safety checks passed/i.test(log)) {
    return { status: "SUBMITTED" };
  }

  return { status: "RUNNING" };
}

export function assistantLogActions(log: string) {
  const actions: Array<{ type: string; message: string }> = [];
  const filled = /Filled (\d+) safe text fields\./i.exec(log);
  const demographic = /Filled (\d+) configured demographic field/i.exec(log);
  const uploads = /Uploaded (\d+) material file/i.exec(log);

  if (filled) actions.push({ type: "filled_safe_fields", message: `${filled[1]} safe text fields filled.` });
  if (demographic) actions.push({ type: "filled_demographic_fields", message: `${demographic[1]} configured demographic fields filled.` });
  if (uploads) actions.push({ type: "uploaded_materials", message: `${uploads[1]} material files uploaded.` });
  if (/Selected application answers:/i.test(log)) actions.push({ type: "prepared_selected_answers", message: "Selected custom-answer drafts were prepared." });

  return actions;
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
