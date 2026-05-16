import { Prisma, type JobSearchRun } from "@prisma/client";
import { runJobSearch } from "@/lib/job-search/ingest";
import { prisma } from "@/lib/prisma";

const staleRunMs = 20 * 60 * 1000;

export async function startJobSearchRun(triggeredBy: "manual" | "cron", options: { scheduleEnabledOnly?: boolean } = {}) {
  const activeRun = await prisma.jobSearchRun.findFirst({
    where: { status: "running" },
    orderBy: { createdAt: "desc" },
  });

  if (activeRun) {
    if (isStaleRunningSearch(activeRun)) {
      await markRunFailed(activeRun.id, new Error(`Search run stopped reporting progress for more than ${Math.round(staleRunMs / 60_000)} minutes.`), activeRun.triggeredBy);
    } else {
      return { run: activeRun, started: false, skipped: true, reason: "A job search run is already in progress." };
    }
  }

  const profiles = await prisma.jobSearchProfile.findMany({
    where: {
      enabled: true,
      ...(options.scheduleEnabledOnly ? { scheduleEnabled: true } : {}),
    },
    select: { id: true },
  });

  const run = await prisma.jobSearchRun.create({
    data: {
      status: "running",
      triggeredBy,
      profileIds: profiles.map((profile) => profile.id),
      progress: [{ at: new Date().toISOString(), message: triggeredBy === "cron" ? "Scheduled search queued." : "Search queued." }],
    },
  });

  void runJobSearch(triggeredBy, run.id).catch((error) => markRunFailed(run.id, error, triggeredBy));

  return { run, started: true, skipped: false, reason: null };
}

export async function recoverStaleSearchRun(run: JobSearchRun | null) {
  if (!run || run.status !== "running" || !isStaleRunningSearch(run)) return run;

  return markRunFailed(
    run.id,
    new Error(`Search run stopped reporting progress for more than ${Math.round(staleRunMs / 60_000)} minutes.`),
    run.triggeredBy,
  );
}

function isStaleRunningSearch(run: Pick<JobSearchRun, "createdAt" | "progress">) {
  return Date.now() - lastProgressAt(run).getTime() > staleRunMs;
}

function lastProgressAt(run: Pick<JobSearchRun, "createdAt" | "progress">) {
  if (Array.isArray(run.progress)) {
    const latest = run.progress[run.progress.length - 1] as { at?: unknown } | undefined;
    if (typeof latest?.at === "string") {
      const parsed = new Date(latest.at);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return run.createdAt;
}

async function markRunFailed(runId: string, error: unknown, triggeredBy: "manual" | "cron") {
  const latest = await prisma.jobSearchRun.findUnique({
    where: { id: runId },
    select: { progress: true },
  });
  const progress = Array.isArray(latest?.progress) ? latest.progress : [];
  const failureLabel = triggeredBy === "cron" ? "Scheduled search" : "Search";
  const message = error instanceof Error ? error.message : "Unknown search failure";

  return prisma.jobSearchRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      errors: [{ message }] as Prisma.InputJsonValue,
      progress: [
        ...progress,
        {
          at: new Date().toISOString(),
          message: `${failureLabel} failed: ${message}`,
        },
      ],
    },
  });
}
