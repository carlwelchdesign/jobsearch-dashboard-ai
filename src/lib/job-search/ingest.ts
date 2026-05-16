import { JobSearchRun, NotificationSettings, Prisma, User } from "@prisma/client";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { hasApplicationForJob, submittedApplicationStatuses, suppressedJobKeySet, suppressedJobMatchStatuses } from "@/lib/applications/job-filters";
import { createCanonicalJobKeys, createJobContentHash, hasSameCanonicalJob } from "@/lib/job-search/dedupe";
import { getAdapterForSource } from "@/lib/job-search/adapters";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import type { NormalizedJobPosting } from "@/lib/job-search/source-adapter";
import { sendNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

type ProgressEvent = {
  at: string;
  message: string;
  stats?: Record<string, number>;
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
  const suppressedJobKeysByUserId = await loadSuppressedJobKeysByUserId(profiles.map((profile) => profile.userId));

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
          const suppressedJobKeys = suppressedJobKeysByUserId.get(profile.userId) ?? new Set<string>();
          if (hasApplicationForJob(jobIdentity(normalized), suppressedJobKeys)) {
            continue;
          }

          const { job, isNew } = await upsertDedupedJob(normalized, source.id);
          if (hasApplicationForJob(job, suppressedJobKeys)) {
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

  if (user?.notificationSettings) {
    await notifyAfterRun(user, user.notificationSettings, updatedRun, newMatches);
  }

  return updatedRun;
}

function jobIdentity(job: Pick<NormalizedJobPosting, "company" | "title" | "location">) {
  return {
    company: job.company,
    title: job.title,
    location: job.location ?? null,
  };
}

async function loadSuppressedJobKeysByUserId(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const entries = await Promise.all(uniqueUserIds.map(async (userId) => {
    const [applications, rejectedMatches] = await Promise.all([
      prisma.application.findMany({
        where: { userId, status: { in: submittedApplicationStatuses } },
        select: {
          status: true,
          jobPosting: {
            select: {
              company: true,
              title: true,
              location: true,
              lastSeenAt: true,
            },
          },
        },
      }),
      prisma.jobProfileMatch.findMany({
        where: {
          status: { in: suppressedJobMatchStatuses },
          jobSearchProfile: { userId },
        },
        select: {
          status: true,
          jobPosting: {
            select: {
              company: true,
              title: true,
              location: true,
              lastSeenAt: true,
            },
          },
        },
      }),
    ]);

    return [userId, suppressedJobKeySet([...applications, ...rejectedMatches])] as const;
  }));

  return new Map(entries);
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

async function appendProgress(runId: string, message: string, stats?: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number }) {
  const progress = await nextProgress(runId, progressEvent(message, stats));
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

function progressEvent(message: string, stats?: { jobsFetched: number; jobsAfterDedupe: number; jobsAfterFilters: number; jobsSaved: number }): ProgressEvent {
  return {
    at: new Date().toISOString(),
    message,
    ...(stats ? { stats } : {}),
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
    `Needs review: ${run.jobsSaved}`,
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
