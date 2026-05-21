import { JobSearchRun, NotificationSettings, Prisma, User } from "@prisma/client";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { createCanonicalJobKeys, createJobContentHash, hasSameCanonicalJob } from "@/lib/job-search/dedupe";
import { getAdapterForSource } from "@/lib/job-search/adapters";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import type { NormalizedJobPosting } from "@/lib/job-search/source-adapter";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { sendNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

type ProgressEvent = {
  at: string;
  message: string;
  stats?: Record<string, number>;
  agencyHandoff?: AgencyHandoffProgress;
};

type AgencyHandoffProgress = {
  status: "started" | "running" | "completed" | "failed" | "skipped";
  reason:
    | "started"
    | "search_not_successful"
    | "no_eligible_matches"
    | "agency_already_running"
    | "agency_failed";
  agentRunId?: string;
  result?: {
    approved: number;
    prepared: number;
    failed: number;
    skipped: number;
  };
  error?: string;
};

const sourceFetchTimeoutMs = 90 * 1000;

export async function runJobSearch(triggeredBy: "manual" | "cron" = "manual", runId?: string) {
  const profiles = await prisma.jobSearchProfile.findMany({
    where: {
      enabled: true,
      ...(triggeredBy === "cron" ? { scheduleEnabled: true } : {}),
    },
  });
  const run = runId
    ? await prisma.jobSearchRun.update({
        where: { id: runId },
        data: {
          status: "running",
          triggeredBy,
          profileIds: profiles.map((profile) => profile.id),
          progress: [],
          errors: [],
        },
      })
    : await prisma.jobSearchRun.create({
        data: {
          status: "running",
          triggeredBy,
          profileIds: profiles.map((profile) => profile.id),
        },
      });
  const user = await prisma.user.findFirst({
    include: {
      notificationSettings: true,
      profile: { include: { experienceBullets: { where: { truthLevel: "verified" } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const sources = (await prisma.jobSource.findMany({ where: { enabled: true, NOT: { type: "manual" } } }))
    .sort((a, b) => sourcePriority(a.type) - sourcePriority(b.type));
  const stats = {
    jobsFetched: 0,
    jobsAfterDedupe: 0,
    jobsAfterFilters: 0,
    jobsSaved: 0,
  };
  const errors: Array<{ source: string; profile: string; message: string }> = [];
  const newMatches: Array<{ score: number; title: string; company: string; profile: string }> = [];
  const suppressionStateByUserId = await loadJobSuppressionStatesByUserIds(profiles.map((profile) => profile.userId));

  await appendProgress(run.id, `Starting job search across ${profiles.length} enabled profiles and ${sources.length} enabled external sources.`, stats);

  for (const profile of profiles) {
    let savedForProfile = 0;
    await appendProgress(run.id, `Profile: ${profile.name}`, stats);
    for (const source of sources) {
      const adapter = getAdapterForSource(source.type);
      if (!adapter) continue;

      try {
        await appendProgress(run.id, `Fetching ${source.name} jobs for ${profile.name}.`, stats);
        const rawJobs = await withTimeout(
          adapter.fetchJobs(profile, source),
          sourceFetchTimeoutMs,
          `${source.name} fetch timed out after ${Math.round(sourceFetchTimeoutMs / 60_000)} minutes.`,
        );
        stats.jobsFetched += rawJobs.length;
        await updateRunStats(run.id, stats, `Fetched ${rawJobs.length} jobs from ${source.name}.`);

        const rankedJobs = (await Promise.all(rawJobs.map(async (rawJob) => {
          const normalized = await adapter.normalize(rawJob);
          return { normalized, score: scoreJobForProfile(normalized, profile) };
        }))).sort((a, b) => b.score.overallScore - a.score.overallScore);
        const jobsToScore = rankedJobs.slice(0, Math.min(rankedJobs.length, Math.max(profile.maxResultsPerRun * 4, 80), 240));
        await appendProgress(run.id, `Scoring ${jobsToScore.length} ${source.name} jobs for ${profile.name}.`, stats);

        for (const [index, rankedJob] of jobsToScore.entries()) {
          if (savedForProfile >= profile.maxResultsPerRun) break;

          const { normalized, score } = rankedJob;
          const suppressionState = suppressionStateByUserId.get(profile.userId);
          if (suppressionState && isJobSuppressed(jobIdentity(normalized), suppressionState)) {
            continue;
          }

          const { job, isNew } = await upsertDedupedJob(normalized, source.id);
          if (suppressionState && isJobSuppressed(job, suppressionState)) {
            continue;
          }
          if (isNew) stats.jobsAfterDedupe += 1;

          if (score.overallScore >= profile.minimumMatchScore) {
            const existing = await prisma.jobProfileMatch.findUnique({
              where: {
                jobPostingId_jobSearchProfileId: {
                  jobPostingId: job.id,
                  jobSearchProfileId: profile.id,
                },
              },
            });
            await prisma.jobProfileMatch.upsert({
              where: {
                jobPostingId_jobSearchProfileId: {
                  jobPostingId: job.id,
                  jobSearchProfileId: profile.id,
                },
              },
              update: {
                ...score,
                status: existing?.status ?? "needs_review",
              },
              create: {
                jobPostingId: job.id,
                jobSearchProfileId: profile.id,
                status: "needs_review",
                ...score,
              },
            });
            await runJobFitScoringAgent({
              jobPostingId: job.id,
              jobSearchProfileId: profile.id,
              userId: user?.id,
            }).catch(async (error) => {
              await appendProgress(run.id, `Evidence scoring failed for ${job.title} at ${job.company}: ${error instanceof Error ? error.message : "Unknown scoring failure"}`, stats);
            });
            stats.jobsAfterFilters += 1;
            if (!existing) {
              stats.jobsSaved += 1;
              savedForProfile += 1;
              newMatches.push({ score: score.overallScore, title: job.title, company: job.company, profile: profile.name });
              await updateRunStats(run.id, stats, `Saved match: ${score.overallScore} - ${job.title} at ${job.company}.`);
            }
          }
          if ((index + 1) % 50 === 0) {
            await updateRunStats(run.id, stats, `Scored ${index + 1}/${jobsToScore.length} ${source.name} jobs for ${profile.name}.`);
          }
        }
        await updateRunStats(run.id, stats, `Finished ${source.name} for ${profile.name}.`);
      } catch (error) {
        errors.push({
          source: source.name,
          profile: profile.name,
          message: error instanceof Error ? error.message : "Unknown source adapter error",
        });
        await appendProgress(run.id, `Error from ${source.name} for ${profile.name}: ${error instanceof Error ? error.message : "Unknown source adapter error"}`, stats);
      }
    }
  }

  const status = errors.length && stats.jobsFetched > 0 ? "partial" : errors.length ? "failed" : "completed";
  const updatedRun = await prisma.jobSearchRun.update({
    where: { id: run.id },
    data: {
      ...stats,
      status,
      errors: errors as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });
  await appendProgress(run.id, `Search ${status}. Saved ${stats.jobsSaved} new matches from ${stats.jobsFetched} fetched jobs.`, stats);
  await runDuplicateStaleJobDetectorAgent({ limit: 1000, userId: user?.id }).catch(async (error) => {
    await appendProgress(run.id, `Duplicate/stale detector failed: ${error instanceof Error ? error.message : "Unknown detector failure"}`, stats);
  });
  await autoRunAgencyAfterSearch({
    runId: run.id,
    userId: user?.id ?? null,
    status,
    jobsSaved: stats.jobsSaved,
    stats,
  });

  if (user?.notificationSettings) {
    await notifyAfterRun(user, user.notificationSettings, updatedRun, newMatches);
  }

  return updatedRun;
}

export async function autoRunAgencyAfterSearch(input: {
  runId: string;
  userId?: string | null;
  status: "completed" | "partial" | "failed";
  jobsSaved: number;
  stats: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number };
}) {
  if (!["completed", "partial"].includes(input.status)) {
    await appendProgress(input.runId, "Recruiting agency skipped because the search did not finish successfully.", input.stats, {
      status: "skipped",
      reason: "search_not_successful",
    });
    return { started: false, reason: "search_not_successful" as const };
  }

  const activeAgencyRun = await prisma.agentRun.findFirst({
    where: { agentType: "RECRUITING_AGENCY", status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (activeAgencyRun) {
    await appendProgress(input.runId, "Recruiting agency skipped because an agency run is already active.", input.stats, {
      status: "running",
      reason: "agency_already_running",
      agentRunId: activeAgencyRun.id,
    });
    return { started: false, reason: "agency_already_running" as const, agentRunId: activeAgencyRun.id };
  }

  const eligible = await prisma.jobProfileMatch.findFirst({
    where: {
      status: "needs_review",
      overallScore: { gte: 90 },
      ...(input.userId ? { jobSearchProfile: { userId: input.userId } } : {}),
      jobPosting: {
        applicationUrl: { not: null },
        applications: {
          none: {
            status: { in: ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"] },
          },
        },
      },
    },
    select: { id: true },
    orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
  });
  if (!eligible) {
    const message = input.jobsSaved <= 0
      ? "Recruiting agency skipped because the search saved no new matches and no existing 90+ application-ready matches were eligible."
      : "Recruiting agency skipped because no new 90+ application-ready matches were eligible.";
    await appendProgress(input.runId, message, input.stats, {
      status: "skipped",
      reason: "no_eligible_matches",
    });
    return { started: false, reason: "no_eligible_matches" as const };
  }

  try {
    const result = await runRecruitingAgency({
      minimumScore: 90,
      limit: 10,
      triggeredBy: "search_auto",
      onStarted: async (agentRunId) => {
        await appendProgress(
          input.runId,
          input.jobsSaved <= 0
            ? "Recruiting agency auto-started for existing eligible strong matches."
            : "Recruiting agency auto-started to approve strong matches and prepare application packets.",
          input.stats,
          {
            status: "started",
            reason: "started",
            agentRunId,
          },
        );
      },
    });
    await appendProgress(
      input.runId,
      `Recruiting agency completed: approved ${result.approved}, prepared ${result.prepared}, failed ${result.failed}.`,
      input.stats,
      {
        status: "completed",
        reason: "started",
        agentRunId: result.agentRunId,
        result: {
          approved: result.approved,
          prepared: result.prepared,
          failed: result.failed,
          skipped: result.skipped,
        },
      },
    );
    return { started: true, reason: "started" as const, agentRunId: result.agentRunId, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agency failure";
    await appendProgress(input.runId, `Recruiting agency auto-run failed: ${message}`, input.stats, {
      status: "failed",
      reason: "agency_failed",
      error: message,
    });
    return { started: false, reason: "agency_failed" as const, error: message };
  }
}

function jobIdentity(job: Pick<NormalizedJobPosting, "company" | "title" | "location" | "applicationUrl">) {
  return {
    company: job.company,
    title: job.title,
    location: job.location ?? null,
    applicationUrl: job.applicationUrl ?? null,
  };
}

async function updateRunStats(runId: string, stats: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number }, message?: string) {
  const progress = message ? await nextProgress(runId, progressEvent(message, stats)) : undefined;
  await prisma.jobSearchRun.update({
    where: { id: runId },
    data: {
      ...stats,
      ...(progress ? { progress: progress as Prisma.InputJsonValue } : {}),
    },
  });
}

async function appendProgress(
  runId: string,
  message: string,
  stats?: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number },
  agencyHandoff?: AgencyHandoffProgress,
) {
  const progress = await nextProgress(runId, progressEvent(message, stats, agencyHandoff));
  await prisma.jobSearchRun.update({
    where: { id: runId },
    data: {
      progress: progress as Prisma.InputJsonValue,
    },
  });
}

async function nextProgress(runId: string, event: ProgressEvent) {
  const run = await prisma.jobSearchRun.findUnique({
    where: { id: runId },
    select: { progress: true },
  });
  const current = Array.isArray(run?.progress) ? (run.progress as ProgressEvent[]) : [];
  return [...current, event].slice(-120);
}

function progressEvent(
  message: string,
  stats?: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number },
  agencyHandoff?: AgencyHandoffProgress,
): ProgressEvent {
  return {
    at: new Date().toISOString(),
    message,
    ...(stats ? { stats } : {}),
    ...(agencyHandoff ? { agencyHandoff } : {}),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sourcePriority(type: string) {
  const priority: Record<string, number> = {
    greenhouse: 1,
    lever: 2,
    ashby: 3,
    company_site: 4,
    weworkremotely: 8,
    remoteok: 99,
  };
  return priority[type] ?? 50;
}

async function upsertDedupedJob(normalized: NormalizedJobPosting, sourceId: string) {
  const contentHash = createJobContentHash(normalized);
  const existing =
    (normalized.applicationUrl
      ? await prisma.jobPosting.findFirst({ where: { applicationUrl: normalized.applicationUrl } })
      : null) ??
    (normalized.sourceJobId
      ? await prisma.jobPosting.findFirst({ where: { sourceId, sourceJobId: normalized.sourceJobId } })
      : null) ??
    (await prisma.jobPosting.findUnique({ where: { contentHash } })) ??
    (await prisma.jobPosting.findFirst({
      where: {
        company: normalized.company,
        title: normalized.title,
        location: normalized.location,
      },
    })) ??
    (await findCanonicalDuplicateJob(normalized));

  if (existing) {
    const job = await prisma.jobPosting.update({
      where: { id: existing.id },
      data: {
        sourceId,
        sourceJobId: normalized.sourceJobId,
        company: normalized.company,
        title: normalized.title,
        location: normalized.location,
        country: normalized.country,
        city: normalized.city,
        remoteType: normalized.remoteType,
        salaryMin: normalized.salaryMin,
        salaryMax: normalized.salaryMax,
        salaryCurrency: normalized.salaryCurrency,
        description: normalized.description,
        requirements: normalized.requirements,
        niceToHaves: normalized.niceToHaves,
        benefits: normalized.benefits,
        applicationUrl: normalized.applicationUrl,
        atsProvider: normalized.atsProvider,
        rawData: normalized.rawData as Prisma.InputJsonValue,
        lastSeenAt: new Date(),
      },
    });
    return { job, isNew: false };
  }

  const job = await prisma.jobPosting.create({
    data: {
      sourceId,
      sourceJobId: normalized.sourceJobId,
      company: normalized.company,
      title: normalized.title,
      location: normalized.location,
      country: normalized.country,
      city: normalized.city,
      remoteType: normalized.remoteType,
      salaryMin: normalized.salaryMin,
      salaryMax: normalized.salaryMax,
      salaryCurrency: normalized.salaryCurrency,
      description: normalized.description,
      requirements: normalized.requirements,
      niceToHaves: normalized.niceToHaves,
      benefits: normalized.benefits,
      applicationUrl: normalized.applicationUrl,
      atsProvider: normalized.atsProvider,
      rawData: normalized.rawData as Prisma.InputJsonValue,
      contentHash,
    },
  });
  return { job, isNew: true };
}

async function findCanonicalDuplicateJob(normalized: NormalizedJobPosting) {
  const canonicalKeys = createCanonicalJobKeys(normalized);
  const companyToken = firstSearchToken(normalized.company);
  const titleToken = firstSearchToken(normalized.title);
  const candidates = await prisma.jobPosting.findMany({
    where: {
      OR: [
        ...(companyToken ? [{ company: { contains: companyToken, mode: "insensitive" as const } }] : []),
        ...(titleToken ? [{ title: { contains: titleToken, mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  return candidates.find((candidate) => hasSameCanonicalJob(candidate, normalized)) ??
    candidates.find((candidate) => createCanonicalJobKeys(candidate).some((key) => canonicalKeys.includes(key))) ??
    null;
}

function firstSearchToken(value: string) {
  return value.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] ?? null;
}

async function notifyAfterRun(
  user: User,
  settings: NotificationSettings,
  run: JobSearchRun,
  newMatches: Array<{ score: number; title: string; company: string; profile: string }>,
) {
  if (settings.notifyOnlyIfNewMatches && newMatches.length === 0) return;

  const strongMatches = newMatches.filter((match) => match.score >= settings.minimumScoreForPush);
  if (settings.digestMode === "strong_matches_only" && strongMatches.length === 0) return;

  const topMatches = newMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((match) => `${match.score} - ${match.title} - ${match.company} (${match.profile})`)
    .join("\n");
  const subject = `${newMatches.length} new jobs found, ${strongMatches.length} strong matches`;
  const body = [
    "The job search run finished.",
    "",
    `Fetched: ${run.jobsFetched}`,
    `New after dedupe: ${run.jobsAfterDedupe}`,
    `Saved for agency review: ${run.jobsSaved}`,
    `Strong matches: ${strongMatches.length}`,
    "",
    "Top matches:",
    topMatches || "No new matches.",
    "",
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/jobs`,
  ].join("\n");

  await sendNotification({
    user,
    settings,
    subject,
    body,
    payload: { runId: run.id, newMatches, strongMatches },
  });
}
