import { existsSync, readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createAgentUserRequest } from "@/lib/agent-user-requests";
import { updateApplicationAutomationRunFromLog } from "@/lib/applications/automation-runs";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { sendNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const event = await prisma.applicationEvent.findFirst({
      where: {
        applicationId: params.id,
        type: "note_added",
      },
      orderBy: { createdAt: "desc" },
    });

    const payload = event?.payload as { logPath?: string; pid?: number } | null;
    const logPath = payload?.logPath;
    if (!logPath) {
      return NextResponse.json({ log: "", message: "No assistant log has been created for this application yet." });
    }

    const logRoot = path.join(process.cwd(), ".assistant-logs");
    const resolved = path.resolve(logPath);
    if (!resolved.startsWith(logRoot)) {
      return NextResponse.json({ error: "Assistant log path is outside the allowed log directory." }, { status: 400 });
    }

    const log = existsSync(resolved) ? readFileSync(resolved, "utf8") : "";
    const automationRun = await updateApplicationAutomationRunFromLog({
      applicationId: params.id,
      logPath: resolved,
      log,
    });
    if (automationRun?.status === "SUBMITTED") {
      const existing = await prisma.applicationOutcome.findFirst({
        where: {
          applicationId: params.id,
          outcome: "APPLIED",
        },
      });
      if (!existing) {
        await recordApplicationOutcome({
          applicationId: params.id,
          outcome: "APPLIED",
          notes: "Application marked applied after gated local assistant auto-submit.",
        });
        await notifyApplicationSubmitted(params.id).catch(() => null);
      }
    }
    if (automationRun?.blockerMessage) {
      await ensureAutomationBlockerRequest(params.id, automationRun.blockerMessage, automationRun.blockerType).catch(() => null);
    }
    return NextResponse.json({
      logPath: resolved,
      pid: payload?.pid,
      automationRun,
      log,
      createdAt: event?.createdAt,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function ensureAutomationBlockerRequest(applicationId: string, blockerMessage: string, blockerType?: string | null) {
  const existing = await prisma.agentUserRequest.findFirst({
    where: {
      applicationId,
      type: "APPLICATION_BLOCKED",
      status: "OPEN",
    },
  });
  if (existing) return existing;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      userId: true,
      jobPostingId: true,
    },
  });
  if (!application) return null;

  return createAgentUserRequest({
    userId: application.userId,
    applicationId,
    jobPostingId: application.jobPostingId,
    type: "APPLICATION_BLOCKED",
    question: blockerMessage,
    contextJson: {
      blockerType: blockerType ?? "unknown",
      source: "assistant_log",
    },
  });
}

async function notifyApplicationSubmitted(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      jobPosting: { select: { company: true, title: true } },
      user: { include: { notificationSettings: true } },
    },
  });
  if (!application?.user.notificationSettings) return [];

  return sendNotification({
    user: application.user,
    settings: application.user.notificationSettings,
    subject: `Application submitted: ${application.jobPosting.company}`,
    body: [
      `${application.jobPosting.title} at ${application.jobPosting.company} was marked applied after gated local assistant auto-submit.`,
      "",
      `Open: /applications/${application.id}`,
    ].join("\n"),
    payload: {
      source: "assistant_auto_submit",
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
    },
  });
}
