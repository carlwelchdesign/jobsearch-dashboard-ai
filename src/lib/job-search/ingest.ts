import { JobSearchRun, NotificationSettings, Prisma, User } from "@prisma/client";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runMarketIntelligenceAgent } from "@/lib/agents/market-intelligence";
import { MAX_RECRUITING_AGENCY_LIMIT } from "@/lib/applications/recruiting-agency-constants";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { createCanonicalJobKeys, createJobContentHash, hasSameCanonicalJob } from "@/lib/job-search/dedupe";
import { getAdapterForSource } from "@/lib/job-search/adapters";
import { classifyJobSearchTitle, scoreJobForProfile } from "@/lib/job-search/scoring";
import { isListingReviewPosting, type NormalizedJobPosting } from "@/lib/job-search/source-adapter";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { sendNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

type ProgressEvent = {
  at: string;
  message: string;
  stats?: JobSearchStats;
  agencyHandoff?: AgencyHandoffProgress;
  marketIntelligence?: MarketIntelligenceProgress;
};

type JobSearchStats = {
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  jobsScored?: number;
  jobsSuppressed?: number;
  listingPagesSuppressed?: number;
  searchQueryTemplates?: number;
  searchQueryProviderDomains?: number;
  searchQueryExpandedLinks?: number;
  providerMissingWarnings?: number;
  jobsBelowThreshold?: number;
  frontendTitles?: number;
  fullStackTitles?: number;
  staffPrincipalLeadTitles?: number;
  managementTitles?: number;
  backendDataPlatformTitles?: number;
  nonTargetTitles?: number;
  genericSoftwareTitles?: number;
  detailCandidates?: number;
  existingJobDuplicates?: number;
  existingProfileMatches?: number;
  profileMaxResultsCapped?: number;
  jobsMissingApplicationUrl?: number;
  agencyEligible?: number;
  reviewOnlyMatches?: number;
  highConfidenceMatches?: number;
  scoreBuckets?: Record<"below" | "nearMiss" | "qualified" | "highConfidence", number>;
  byProfile?: Record<string, SearchDimensionStats>;
  bySource?: Record<string, SearchDimensionStats>;
};

type SearchDimensionStats = {
  fetched?: number;
  candidates?: number;
  scored?: number;
  qualified?: number;
  saved?: number;
  belowThreshold?: number;
  duplicates?: number;
  existingMatches?: number;
  suppressed?: number;
  capped?: number;
  missingApplicationUrl?: number;
  reviewOnly?: number;
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

type MarketIntelligenceProgress = {
  status: "completed" | "failed" | "skipped";
  reason: "started" | "search_not_successful" | "market_intelligence_failed";
  agentRunId?: string;
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
    jobsScored: 0,
    jobsSuppressed: 0,
    listingPagesSuppressed: 0,
    searchQueryTemplates: 0,
    searchQueryProviderDomains: 0,
    searchQueryExpandedLinks: 0,
    providerMissingWarnings: 0,
    jobsBelowThreshold: 0,
    frontendTitles: 0,
    fullStackTitles: 0,
    staffPrincipalLeadTitles: 0,
    managementTitles: 0,
    backendDataPlatformTitles: 0,
    nonTargetTitles: 0,
    genericSoftwareTitles: 0,
    detailCandidates: 0,
    existingJobDuplicates: 0,
    existingProfileMatches: 0,
    profileMaxResultsCapped: 0,
    jobsMissingApplicationUrl: 0,
    agencyEligible: 0,
    reviewOnlyMatches: 0,
    highConfidenceMatches: 0,
    scoreBuckets: { below: 0, nearMiss: 0, qualified: 0, highConfidence: 0 },
    byProfile: {},
    bySource: {},
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
        if (source.type === "search_query") {
          const coverage = searchQueryCoverage(source.config);
          stats.searchQueryTemplates = coverage.queryCount;
          stats.searchQueryProviderDomains = coverage.providerDomains.length;
          if (!process.env.BRAVE_SEARCH_API_KEY) {
            stats.providerMissingWarnings = (stats.providerMissingWarnings ?? 0) + 1;
            await appendProgress(run.id, `${source.name} is enabled but BRAVE_SEARCH_API_KEY is missing; ${coverage.queryCount} provider query templates covering ${coverage.providerDomains.length} domain(s) cannot run.`, stats);
          } else {
            await appendProgress(run.id, `${source.name} coverage: ${coverage.queryCount} query templates across ${coverage.providerDomains.length} provider domain(s).`, stats);
          }
        }
        await appendProgress(run.id, `Fetching ${source.name} jobs for ${profile.name}.`, stats);
        const rawJobs = await withTimeout(
          adapter.fetchJobs(profile, source),
          sourceFetchTimeoutMs,
          `${source.name} fetch timed out after ${Math.round(sourceFetchTimeoutMs / 60_000)} minutes.`,
        );
        stats.jobsFetched += rawJobs.length;
        if (source.type === "search_query") {
          const expandedLinks = rawJobs.filter(hasSearchExpansionProvider).length;
          stats.searchQueryExpandedLinks = (stats.searchQueryExpandedLinks ?? 0) + expandedLinks;
          if (expandedLinks > 0) {
            await appendProgress(run.id, `${source.name} expanded ${expandedLinks} listing result${expandedLinks === 1 ? "" : "s"} into job-detail link${expandedLinks === 1 ? "" : "s"}.`, stats);
          }
        }
        const listingReviews = rawJobs.filter(isListingReviewPosting);
        if (listingReviews.length > 0) {
          stats.listingPagesSuppressed += listingReviews.length;
          for (const listing of listingReviews.slice(0, 20)) {
            await appendProgress(run.id, listingReviewMessage(listing), stats);
          }
        }
        const jobCandidates = rawJobs.filter((rawJob) => !isListingReviewPosting(rawJob));
        stats.detailCandidates += jobCandidates.length;
        addDimensionStat(stats.byProfile, profile.name, "fetched", rawJobs.length);
        addDimensionStat(stats.byProfile, profile.name, "candidates", jobCandidates.length);
        addDimensionStat(stats.bySource, source.name, "fetched", rawJobs.length);
        addDimensionStat(stats.bySource, source.name, "candidates", jobCandidates.length);
        await updateRunStats(run.id, stats, `Fetched ${rawJobs.length} jobs from ${source.name}.`);

        const rankedJobs = (await Promise.all(jobCandidates.map(async (rawJob) => {
          const normalized = await adapter.normalize(rawJob);
          const score = scoreJobForProfile(normalized, profile);
          const classification = classifyJobSearchTitle(normalized.title, normalized.description);
          recordSearchDiagnostics(stats, classification);
          return { normalized, score, classification };
        }))).sort((a, b) => b.score.overallScore - a.score.overallScore);
        stats.jobsScored += rankedJobs.length;
        addDimensionStat(stats.byProfile, profile.name, "scored", rankedJobs.length);
        addDimensionStat(stats.bySource, source.name, "scored", rankedJobs.length);
        const jobsToScore = rankedJobs.slice(0, Math.min(rankedJobs.length, Math.max(profile.maxResultsPerRun * 8, 160), 600));
        if (rankedJobs.length > jobsToScore.length) {
          stats.profileMaxResultsCapped += rankedJobs.length - jobsToScore.length;
          addDimensionStat(stats.byProfile, profile.name, "capped", rankedJobs.length - jobsToScore.length);
        }
        await appendProgress(run.id, `Scoring ${jobsToScore.length} ${source.name} jobs for ${profile.name}.`, stats);

        for (const [index, rankedJob] of jobsToScore.entries()) {
          if (savedForProfile >= profile.maxResultsPerRun) break;

          const { normalized, score } = rankedJob;
          recordScoreBucket(stats, score.overallScore, profile.minimumMatchScore);
          const suppressionState = suppressionStateByUserId.get(profile.userId);
          if (suppressionState && isJobSuppressed(jobIdentity(normalized), suppressionState)) {
            stats.jobsSuppressed += 1;
            addDimensionStat(stats.byProfile, profile.name, "suppressed", 1);
            addDimensionStat(stats.bySource, source.name, "suppressed", 1);
            continue;
          }

          const { job, isNew } = await upsertDedupedJob(normalized, source.id);
          if (suppressionState && isJobSuppressed(job, suppressionState)) {
            stats.jobsSuppressed += 1;
            addDimensionStat(stats.byProfile, profile.name, "suppressed", 1);
            addDimensionStat(stats.bySource, source.name, "suppressed", 1);
            continue;
          }
          if (isNew) stats.jobsAfterDedupe += 1;
          else stats.existingJobDuplicates += 1;

          if (score.overallScore >= profile.minimumMatchScore) {
            const existing = await prisma.jobProfileMatch.findUnique({
              where: {
                jobPostingId_jobSearchProfileId: {
                  jobPostingId: job.id,
                  jobSearchProfileId: profile.id,
                },
              },
            });
            const reviewOnly = isReviewOnlyBroadMatch(profile, score.overallScore);
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
                recommendedAction: reviewOnly ? reviewOnlyRecommendedAction(score.recommendedAction) : score.recommendedAction,
              },
              create: {
                jobPostingId: job.id,
                jobSearchProfileId: profile.id,
                status: "needs_review",
                ...score,
                recommendedAction: reviewOnly ? reviewOnlyRecommendedAction(score.recommendedAction) : score.recommendedAction,
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
            addDimensionStat(stats.byProfile, profile.name, "qualified", 1);
            addDimensionStat(stats.bySource, source.name, "qualified", 1);
            if (!job.applicationUrl) {
              stats.jobsMissingApplicationUrl += 1;
              addDimensionStat(stats.byProfile, profile.name, "missingApplicationUrl", 1);
              addDimensionStat(stats.bySource, source.name, "missingApplicationUrl", 1);
            } else if (reviewOnly) {
              stats.reviewOnlyMatches += 1;
              addDimensionStat(stats.byProfile, profile.name, "reviewOnly", 1);
              addDimensionStat(stats.bySource, source.name, "reviewOnly", 1);
            } else {
              stats.agencyEligible += 1;
            }
            if (score.overallScore >= highConfidenceThreshold(profile)) stats.highConfidenceMatches += 1;
            if (!existing) {
              stats.jobsSaved += 1;
              savedForProfile += 1;
              addDimensionStat(stats.byProfile, profile.name, "saved", 1);
              addDimensionStat(stats.bySource, source.name, "saved", 1);
              newMatches.push({ score: score.overallScore, title: job.title, company: job.company, profile: profile.name });
              await updateRunStats(run.id, stats, `Saved match: ${score.overallScore} - ${job.title} at ${job.company}.`);
            } else {
              stats.existingProfileMatches += 1;
              addDimensionStat(stats.byProfile, profile.name, "existingMatches", 1);
              addDimensionStat(stats.bySource, source.name, "existingMatches", 1);
            }
          } else {
            stats.jobsBelowThreshold += 1;
            addDimensionStat(stats.byProfile, profile.name, "belowThreshold", 1);
            addDimensionStat(stats.bySource, source.name, "belowThreshold", 1);
          }
          if ((index + 1) % 50 === 0) {
            await updateRunStats(run.id, stats, `Scored ${index + 1}/${jobsToScore.length} ${source.name} jobs for ${profile.name}.`);
          }
        }
        if (savedForProfile >= profile.maxResultsPerRun) {
          stats.profileMaxResultsCapped += 1;
          addDimensionStat(stats.byProfile, profile.name, "capped", 1);
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
      jobsFetched: stats.jobsFetched,
      jobsAfterDedupe: stats.jobsAfterDedupe,
      jobsAfterFilters: stats.jobsAfterFilters,
      jobsSaved: stats.jobsSaved,
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
  await autoRunMarketIntelligenceAfterSearch({
    runId: run.id,
    userId: user?.id ?? null,
    triggeredBy,
    status,
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
  stats: JobSearchStats;
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

  const eligibleCount = await prisma.jobProfileMatch.count({
    where: {
      status: "needs_review",
      ...(input.userId ? { jobSearchProfile: { userId: input.userId } } : {}),
      NOT: {
        recommendedAction: {
          startsWith: "Review-only broad discovery",
        },
      },
      jobPosting: {
        applicationUrl: { not: null },
        applications: {
          none: {
            status: { in: ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"] },
          },
        },
      },
    },
  });
  if (eligibleCount <= 0) {
    const message = input.jobsSaved <= 0
      ? "Recruiting agency skipped because the search saved no new matches and no existing application-ready matches were eligible."
      : "Recruiting agency skipped because no new application-ready matches were eligible.";
    await appendProgress(input.runId, message, input.stats, {
      status: "skipped",
      reason: "no_eligible_matches",
    });
    return { started: false, reason: "no_eligible_matches" as const };
  }

  try {
    const limit = Math.min(Math.max(eligibleCount, 1), MAX_RECRUITING_AGENCY_LIMIT);
    const result = await runRecruitingAgency({
      minimumScore: 0,
      limit,
      triggeredBy: "search_auto",
      onStarted: async (agentRunId) => {
        await appendProgress(
          input.runId,
          input.jobsSaved <= 0
            ? `Recruiting agency auto-started for ${eligibleCount} existing eligible application-ready match${eligibleCount === 1 ? "" : "es"}.`
            : `Recruiting agency auto-started to prepare ${eligibleCount} eligible saved match${eligibleCount === 1 ? "" : "es"} for Apply Sprint.`,
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

export async function autoRunMarketIntelligenceAfterSearch(input: {
  runId: string;
  userId?: string | null;
  triggeredBy: "manual" | "cron";
  status: "completed" | "partial" | "failed";
  stats: JobSearchStats;
}) {
  if (!["completed", "partial"].includes(input.status)) {
    await appendProgress(input.runId, "Market intelligence skipped because the search did not finish successfully.", input.stats, undefined, {
      status: "skipped",
      reason: "search_not_successful",
    });
    return { started: false, reason: "search_not_successful" as const };
  }

  try {
    await appendProgress(input.runId, "Market intelligence started after search completion.", input.stats);
    const result = await runMarketIntelligenceAgent({
      userId: input.userId ?? undefined,
      researchDepth: "standard",
      triggeredBy: input.triggeredBy,
      jobSearchRunId: input.runId,
      source: "search_completion",
    });
    await appendProgress(
      input.runId,
      `Market intelligence completed with ${result.output.marketTemperature.length} lane signal(s), ${result.output.recommendedActions.length} recommendation(s), ${result.output.adaptationSummary?.applied ?? 0} applied search adaptation(s), and ${result.output.adaptationSummary?.reviewOnly ?? 0} review item(s).`,
      input.stats,
      undefined,
      {
        status: "completed",
        reason: "started",
        agentRunId: result.run.id,
      },
    );
    return { started: true, reason: "started" as const, agentRunId: result.run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market intelligence failure";
    await appendProgress(input.runId, `Market intelligence failed after search completion: ${message}`, input.stats, undefined, {
      status: "failed",
      reason: "market_intelligence_failed",
      error: message,
    });
    return { started: false, reason: "market_intelligence_failed" as const, error: message };
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

function recordSearchDiagnostics(stats: JobSearchStats, classification: ReturnType<typeof classifyJobSearchTitle>) {
  if (classification.frontend) stats.frontendTitles = (stats.frontendTitles ?? 0) + 1;
  if (classification.fullStack) stats.fullStackTitles = (stats.fullStackTitles ?? 0) + 1;
  if (classification.overSenior) stats.staffPrincipalLeadTitles = (stats.staffPrincipalLeadTitles ?? 0) + 1;
  if (classification.management) stats.managementTitles = (stats.managementTitles ?? 0) + 1;
  if (classification.backendDataPlatformOnly) stats.backendDataPlatformTitles = (stats.backendDataPlatformTitles ?? 0) + 1;
  if (classification.nonTarget) stats.nonTargetTitles = (stats.nonTargetTitles ?? 0) + 1;
  if (classification.genericSoftwareWithoutFrontend) stats.genericSoftwareTitles = (stats.genericSoftwareTitles ?? 0) + 1;
}

function recordScoreBucket(stats: JobSearchStats, score: number, threshold: number) {
  stats.scoreBuckets ??= { below: 0, nearMiss: 0, qualified: 0, highConfidence: 0 };
  if (score >= Math.max(85, threshold + 10)) stats.scoreBuckets.highConfidence += 1;
  else if (score >= threshold) stats.scoreBuckets.qualified += 1;
  else if (score >= Math.max(0, threshold - 10)) stats.scoreBuckets.nearMiss += 1;
  else stats.scoreBuckets.below += 1;
}

function addDimensionStat(container: Record<string, SearchDimensionStats> | undefined, key: string, field: keyof SearchDimensionStats, amount: number) {
  if (!container || amount <= 0) return;
  container[key] ??= {};
  container[key][field] = (container[key][field] ?? 0) + amount;
}

function isReviewOnlyBroadMatch(profile: { name: string; searchIntent: string; minimumMatchScore: number }, score: number) {
  return isBroadDiscoveryProfile(profile) && score < highConfidenceThreshold(profile);
}

function isBroadDiscoveryProfile(profile: { name: string; searchIntent: string }) {
  return profile.searchIntent === "custom" && /linkedin|broad|wide net/i.test(profile.name);
}

function highConfidenceThreshold(profile: { minimumMatchScore: number }) {
  return Math.max(75, profile.minimumMatchScore + 12);
}

function reviewOnlyRecommendedAction(action: string) {
  return `Review-only broad discovery: ${action}`;
}

function listingReviewMessage(raw: { listingReview?: { url: string; reason: string; sourceTitle?: string; query?: string; blocked?: boolean } }) {
  const listing = raw.listingReview;
  if (!listing) return "Suppressed a search listing page before scoring.";
  const blocked = listing.blocked ? " Fetch was blocked or unavailable." : "";
  const query = listing.query ? ` Query: ${listing.query}.` : "";
  const title = listing.sourceTitle ? ` Title: ${listing.sourceTitle}.` : "";
  return `Suppressed search listing page before scoring: ${listing.url}. Reason: ${listing.reason}.${blocked}${title}${query}`;
}

function searchQueryCoverage(config: unknown) {
  const input = isRecord(config) ? config : {};
  const queries = Array.isArray(input.queries)
    ? input.queries.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const domains = new Set<string>();
  for (const query of queries) {
    for (const match of query.matchAll(/\bsite:([^\s"']+)/gi)) {
      const domain = (match[1] ?? "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
      if (domain) domains.add(domain);
    }
  }
  return { queryCount: queries.length, providerDomains: [...domains].sort() };
}

function hasSearchExpansionProvider(raw: unknown) {
  if (!isRecord(raw)) return false;
  const rawData = raw.rawData;
  return isRecord(rawData) && typeof rawData.expansionProvider === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function updateRunStats(runId: string, stats: JobSearchStats, message?: string) {
  const progress = message ? await nextProgress(runId, progressEvent(message, stats)) : undefined;
  await prisma.jobSearchRun.update({
    where: { id: runId },
    data: {
      jobsFetched: stats.jobsFetched,
      jobsAfterDedupe: stats.jobsAfterDedupe,
      jobsAfterFilters: stats.jobsAfterFilters,
      jobsSaved: stats.jobsSaved,
      ...(progress ? { progress: progress as Prisma.InputJsonValue } : {}),
    },
  });
}

async function appendProgress(
  runId: string,
  message: string,
  stats?: JobSearchStats,
  agencyHandoff?: AgencyHandoffProgress,
  marketIntelligence?: MarketIntelligenceProgress,
) {
  const progress = await nextProgress(runId, progressEvent(message, stats, agencyHandoff, marketIntelligence));
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
  stats?: JobSearchStats,
  agencyHandoff?: AgencyHandoffProgress,
  marketIntelligence?: MarketIntelligenceProgress,
): ProgressEvent {
  return {
    at: new Date().toISOString(),
    message,
    ...(stats ? { stats } : {}),
    ...(agencyHandoff ? { agencyHandoff } : {}),
    ...(marketIntelligence ? { marketIntelligence } : {}),
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
  const subject = `${newMatches.length} new jobs found, ${strongMatches.length} notification-priority matches`;
  const body = [
    "The job search run finished.",
    "",
    `Fetched: ${run.jobsFetched}`,
    `New after dedupe: ${run.jobsAfterDedupe}`,
    `Saved for Apply Sprint prep: ${run.jobsSaved}`,
    `Notification-priority matches: ${strongMatches.length}`,
    "",
    "Top matches:",
    topMatches || "No new matches.",
    "",
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/applications/assistant`,
  ].join("\n");

  await sendNotification({
    user,
    settings,
    subject,
    body,
    payload: { runId: run.id, newMatches, strongMatches },
  });
}
