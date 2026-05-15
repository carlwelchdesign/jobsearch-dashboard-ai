import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, openSync } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { createApplicationAutomationRun } from "@/lib/applications/automation-runs";
import { prisma } from "@/lib/prisma";

export type LaunchAssistantResult = {
  ok: true;
  pid: number | undefined;
  automationRunId: string;
  logPath: string;
  message: string;
  manualSubmitRequired: true;
  application: {
    id: string;
    company: string;
    title: string;
    applicationUrl: string | null;
  };
};

export async function launchApplicationAssistant(applicationId: string, origin: string): Promise<LaunchAssistantResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { coverLetter: true, jobPosting: true, resume: true },
  });

  if (!application) throw new Error("Application not found.");
  if (application.status !== "ready_to_apply") {
    throw new Error("Prepare the application package first. The assistant only runs for ready_to_apply applications.");
  }
  if (!application.jobPosting.applicationUrl) throw new Error("This job does not have an application URL.");
  if (!application.resume || !application.coverLetter) {
    throw new Error("A generated resume and cover letter are required before launching the assistant.");
  }

  const scriptPath = path.join(process.cwd(), "scripts", "playwright_assistant.py");
  if (!existsSync(scriptPath)) throw new Error("The local Playwright assistant script is missing.");

  const venvPython = path.join(process.cwd(), ".venv-assistant", "bin", "python");
  const python = process.env.ASSISTANT_PYTHON ?? (existsSync(venvPython) ? venvPython : "python3");
  const playwrightCheck = spawnSync(python, ["-c", "import playwright.sync_api"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (playwrightCheck.status !== 0) {
    throw new Error("Python Playwright is not installed yet. Run npm run assistant:install once, then launch the assistant from the app.");
  }

  const closeAfter = process.env.ASSISTANT_CLOSE_AFTER_SECONDS ?? "3600";
  const logDir = path.join(process.cwd(), ".assistant-logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${application.id}-${Date.now()}.log`);
  const logFd = openSync(logPath, "a");
  const profileDir =
    process.env.ASSISTANT_BROWSER_PROFILE_DIR ??
    path.join(process.cwd(), ".assistant-browser-profiles", `${application.id}-${Date.now()}`);

  const child = spawn(
    python,
    [
      "-u",
      scriptPath,
      application.id,
      "--app-url",
      origin,
      "--close-after",
      closeAfter,
      "--browser-channel",
      process.env.ASSISTANT_BROWSER_CHANNEL ?? "chrome",
      "--user-data-dir",
      profileDir,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", logFd, logFd],
    },
  );
  child.unref();

  const automationRun = await createApplicationAutomationRun({
    userId: application.userId,
    applicationId: application.id,
    jobPostingId: application.jobPostingId,
    currentUrl: application.jobPosting.applicationUrl,
    logPath,
    pid: child.pid,
    actionsJson: [{
      type: "assistant_launched",
      message: "Local Playwright assistant launched. Manual submit checkpoint required.",
      profileDir,
    }],
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "note_added",
      payload: {
        note: "Local Playwright assistant launched. Manual submit checkpoint required.",
        applicationUrl: application.jobPosting.applicationUrl,
        logPath,
        pid: child.pid,
        automationRunId: automationRun.id,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    ok: true,
    pid: child.pid,
    automationRunId: automationRun.id,
    logPath,
    message: `Assistant launched for ${application.jobPosting.company} - ${application.jobPosting.title}. Review the browser, then submit manually.`,
    manualSubmitRequired: true,
    application: {
      id: application.id,
      company: application.jobPosting.company,
      title: application.jobPosting.title,
      applicationUrl: application.jobPosting.applicationUrl,
    },
  };
}
