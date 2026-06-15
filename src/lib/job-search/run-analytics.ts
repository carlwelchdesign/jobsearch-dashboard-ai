export type SearchRunStatsSnapshot = {
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  detailCandidates?: number;
  jobsScored?: number;
  jobsBelowThreshold?: number;
  jobsSuppressed?: number;
  listingPagesSuppressed?: number;
  searchQueryExpandedLinks?: number;
  providerMissingWarnings?: number;
  existingJobDuplicates?: number;
  existingProfileMatches?: number;
  profileMaxResultsCapped?: number;
  jobsMissingApplicationUrl?: number;
  agencyEligible?: number;
  reviewOnlyMatches?: number;
  highConfidenceMatches?: number;
  frontendTitles?: number;
  fullStackTitles?: number;
  staffPrincipalLeadTitles?: number;
  managementTitles?: number;
  backendDataPlatformTitles?: number;
  nonTargetTitles?: number;
  genericSoftwareTitles?: number;
  scoreBuckets?: Record<string, number>;
  byProfile?: Record<string, SearchRunDimensionStats>;
  bySource?: Record<string, SearchRunDimensionStats>;
};

export type SearchRunDimensionStats = {
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

export type SearchRunAnalyticsInput = {
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress?: unknown;
};

export type SearchRunTrendInput = SearchRunAnalyticsInput & {
  id: string;
  startedAt: Date | string;
};

export type SearchRunAnalytics = {
  stats: SearchRunStatsSnapshot;
  funnel: Array<{ label: string; value: number; helper: string }>;
  drops: Array<{ label: string; value: number }>;
  scoreDistribution: Array<{ label: string; value: number }>;
  byProfile: Array<{ label: string; fetched: number; scored: number; qualified: number; saved: number; capped: number }>;
  bySource: Array<{ label: string; fetched: number; scored: number; qualified: number; saved: number }>;
  outcomeMix: Array<{ label: string; value: number; helper: string }>;
  sourceYield: Array<{ label: string; fetched: number; qualified: number; saved: number; qualifiedRate: number; saveRate: number }>;
  profileYield: Array<{ label: string; qualified: number; saved: number; capped: number; yieldRate: number }>;
  qualityBands: Array<{ label: string; value: number; helper: string }>;
  topBlocker: { label: string; value: number; helper: string } | null;
  bestSource: { label: string; value: number; helper: string } | null;
  bestProfile: { label: string; value: number; helper: string } | null;
  explanations: string[];
};

const emptyBuckets = {
  below: 0,
  nearMiss: 0,
  qualified: 0,
  highConfidence: 0,
};

export function buildSearchRunAnalytics(run: SearchRunAnalyticsInput | null | undefined): SearchRunAnalytics {
  const stats = latestStats(run);
  const detailCandidates = stats.detailCandidates ?? Math.max(0, stats.jobsFetched - (stats.listingPagesSuppressed ?? 0));
  const scored = stats.jobsScored ?? detailCandidates;
  const agencyEligible = stats.agencyEligible ?? Math.max(0, stats.jobsSaved - (stats.jobsMissingApplicationUrl ?? 0) - (stats.reviewOnlyMatches ?? 0));

  const funnel = [
    { label: "Fetched", value: stats.jobsFetched, helper: "Raw source results" },
    { label: "Detail candidates", value: detailCandidates, helper: "Listing pages removed or expanded" },
    { label: "Scored", value: scored, helper: "Normalized jobs scored against profiles" },
    { label: "Qualified", value: stats.jobsAfterFilters, helper: "Met profile threshold" },
    { label: "New matches", value: stats.jobsSaved, helper: "New profile matches created" },
    { label: "Agency eligible", value: agencyEligible, helper: "Has URL and is not review-only" },
  ];

  const drops = [
    { label: "Below threshold", value: stats.jobsBelowThreshold ?? Math.max(0, scored - stats.jobsAfterFilters) },
    { label: "Existing job duplicate", value: stats.existingJobDuplicates ?? Math.max(0, stats.jobsAfterFilters - stats.jobsAfterDedupe) },
    { label: "Existing profile match", value: stats.existingProfileMatches ?? 0 },
    { label: "Suppressed", value: stats.jobsSuppressed ?? 0 },
    { label: "Listing page suppressed", value: stats.listingPagesSuppressed ?? 0 },
    { label: "Missing apply URL", value: stats.jobsMissingApplicationUrl ?? 0 },
    { label: "Profile cap", value: stats.profileMaxResultsCapped ?? 0 },
    { label: "Review-only broad matches", value: stats.reviewOnlyMatches ?? 0 },
    { label: "Provider warnings", value: stats.providerMissingWarnings ?? 0 },
  ].filter((item) => item.value > 0);

  const buckets = { ...emptyBuckets, ...stats.scoreBuckets };
  const scoreDistribution = [
    { label: "Below threshold", value: buckets.below ?? 0 },
    { label: "Near miss", value: buckets.nearMiss ?? 0 },
    { label: "Qualified", value: buckets.qualified ?? 0 },
    { label: "High confidence", value: buckets.highConfidence ?? 0 },
  ].filter((item) => item.value > 0);

  const byProfile = dimensionRows(stats.byProfile).map((row) => ({
    label: row.label,
    fetched: row.fetched,
    scored: row.scored,
    qualified: row.qualified,
    saved: row.saved,
    capped: row.capped,
  }));
  const bySource = dimensionRows(stats.bySource).map((row) => ({
    label: row.label,
    fetched: row.fetched,
    scored: row.scored,
    qualified: row.qualified,
    saved: row.saved,
  }));
  const outcomeMix = buildOutcomeMix({ stats, scored, agencyEligible });
  const sourceYield = bySource.map((row) => ({
    ...row,
    qualifiedRate: percent(row.qualified, row.fetched),
    saveRate: percent(row.saved, row.fetched),
  }));
  const profileYield = byProfile.map((row) => ({
    label: row.label,
    qualified: row.qualified,
    saved: row.saved,
    capped: row.capped,
    yieldRate: percent(row.saved, row.qualified),
  }));
  const qualityBands = [
    { label: "Below", value: buckets.below ?? 0, helper: "Below threshold" },
    { label: "Near miss", value: buckets.nearMiss ?? 0, helper: "Reviewable but not ready" },
    { label: "Qualified", value: buckets.qualified ?? 0, helper: "Met profile threshold" },
    { label: "High confidence", value: buckets.highConfidence ?? 0, helper: "Strong application candidates" },
  ].filter((item) => item.value > 0);
  const topBlocker = drops[0] ? {
    label: drops[0].label,
    value: drops[0].value,
    helper: blockerHelper(drops[0].label),
  } : null;
  const bestSource = sourceYield[0] ? {
    label: sourceYield[0].label,
    value: sourceYield[0].saved || sourceYield[0].qualified,
    helper: `${sourceYield[0].saved} saved · ${sourceYield[0].qualifiedRate}% qualified`,
  } : null;
  const bestProfile = profileYield[0] ? {
    label: profileYield[0].label,
    value: profileYield[0].saved || profileYield[0].qualified,
    helper: `${profileYield[0].saved} saved · ${profileYield[0].yieldRate}% yield`,
  } : null;

  return {
    stats,
    funnel,
    drops,
    scoreDistribution,
    byProfile,
    bySource,
    outcomeMix,
    sourceYield,
    profileYield,
    qualityBands,
    topBlocker,
    bestSource,
    bestProfile,
    explanations: explanationsFor({ stats, scored, detailCandidates, agencyEligible }),
  };
}

export function buildSearchRunTrend(runs: SearchRunTrendInput[]) {
  return runs
    .slice()
    .reverse()
    .map((run) => {
      const analytics = buildSearchRunAnalytics(run);
      return {
        id: run.id,
        label: shortDate(run.startedAt),
        fetched: analytics.stats.jobsFetched,
        qualified: analytics.stats.jobsAfterFilters,
        saved: analytics.stats.jobsSaved,
        agencyEligible: analytics.stats.agencyEligible ?? 0,
      };
    });
}

export function latestStats(run: SearchRunAnalyticsInput | null | undefined): SearchRunStatsSnapshot {
  const fallback: SearchRunStatsSnapshot = {
    jobsFetched: run?.jobsFetched ?? 0,
    jobsAfterDedupe: run?.jobsAfterDedupe ?? 0,
    jobsAfterFilters: run?.jobsAfterFilters ?? 0,
    jobsSaved: run?.jobsSaved ?? 0,
  };
  if (!Array.isArray(run?.progress)) return fallback;
  const latest = [...run.progress].reverse().find((event) => (
    event && typeof event === "object" && !Array.isArray(event) && typeof (event as { stats?: unknown }).stats === "object"
  )) as { stats?: Record<string, unknown> } | undefined;
  if (!latest?.stats) return fallback;
  return {
    ...fallback,
    ...numericStats(latest.stats),
    scoreBuckets: recordOfNumbers(latest.stats.scoreBuckets),
    byProfile: recordOfDimensionStats(latest.stats.byProfile),
    bySource: recordOfDimensionStats(latest.stats.bySource),
  };
}

function numericStats(input: Record<string, unknown>): Partial<SearchRunStatsSnapshot> {
  const output: Partial<SearchRunStatsSnapshot> = {};
  for (const key of [
    "jobsFetched",
    "jobsAfterDedupe",
    "jobsAfterFilters",
    "jobsSaved",
    "detailCandidates",
    "jobsScored",
    "jobsBelowThreshold",
    "jobsSuppressed",
    "listingPagesSuppressed",
    "searchQueryExpandedLinks",
    "providerMissingWarnings",
    "existingJobDuplicates",
    "existingProfileMatches",
    "profileMaxResultsCapped",
    "jobsMissingApplicationUrl",
    "agencyEligible",
    "reviewOnlyMatches",
    "highConfidenceMatches",
    "frontendTitles",
    "fullStackTitles",
    "staffPrincipalLeadTitles",
    "managementTitles",
    "backendDataPlatformTitles",
    "nonTargetTitles",
    "genericSoftwareTitles",
  ] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
  }
  return output;
}

function recordOfNumbers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count)) output[key] = count;
  }
  return Object.keys(output).length ? output : undefined;
}

function recordOfDimensionStats(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, SearchRunDimensionStats> = {};
  for (const [key, raw] of Object.entries(value)) {
    const stats = recordOfNumbers(raw);
    if (stats) output[key] = stats;
  }
  return Object.keys(output).length ? output : undefined;
}

function dimensionRows(value: Record<string, SearchRunDimensionStats> | undefined) {
  return Object.entries(value ?? {})
    .map(([label, stats]) => ({
      label,
      fetched: stats.fetched ?? 0,
      scored: stats.scored ?? 0,
      qualified: stats.qualified ?? 0,
      saved: stats.saved ?? 0,
      capped: stats.capped ?? 0,
    }))
    .sort((a, b) => (b.saved - a.saved) || (b.qualified - a.qualified) || (b.fetched - a.fetched))
    .slice(0, 8);
}

function buildOutcomeMix(input: { stats: SearchRunStatsSnapshot; scored: number; agencyEligible: number }) {
  const { stats, scored, agencyEligible } = input;
  const belowThreshold = Math.max(0, stats.jobsBelowThreshold ?? scored - stats.jobsAfterFilters);
  const listingSuppressed = stats.listingPagesSuppressed ?? 0;
  const suppressed = stats.jobsSuppressed ?? 0;
  const existingMatch = stats.existingProfileMatches ?? 0;
  const missingUrl = stats.jobsMissingApplicationUrl ?? 0;
  const reviewOnly = stats.reviewOnlyMatches ?? 0;
  const saved = Math.max(0, stats.jobsSaved);
  return [
    { label: "Saved", value: saved, helper: "New matches created" },
    { label: "Agency eligible", value: agencyEligible, helper: "Ready for Apply Sprint" },
    { label: "Review-only", value: reviewOnly, helper: "Held for manual review" },
    { label: "Missing URL", value: missingUrl, helper: "Needs an application link" },
    { label: "Existing match", value: existingMatch, helper: "Already known for a profile" },
    { label: "Below threshold", value: belowThreshold, helper: "Scored below active profiles" },
    { label: "Suppressed/listing", value: suppressed + listingSuppressed, helper: "Noise removed before scoring" },
  ].filter((item) => item.value > 0);
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function blockerHelper(label: string) {
  if (label === "Below threshold") return "Profile scoring filtered most of this run.";
  if (label === "Existing job duplicate") return "The search rediscovered jobs already in the system.";
  if (label === "Existing profile match") return "The profile already had these matches.";
  if (label === "Suppressed") return "Search noise was removed before handoff.";
  if (label === "Listing page suppressed") return "Listing and search pages were blocked before scoring.";
  if (label === "Missing apply URL") return "Saved matches need usable application links.";
  if (label === "Profile cap") return "At least one profile hit its run cap.";
  if (label === "Review-only broad matches") return "Broad matches are waiting for manual review.";
  if (label === "Provider warnings") return "A provider configuration limited discovery.";
  return "This was the largest blocker in the run.";
}

function explanationsFor(input: { stats: SearchRunStatsSnapshot; scored: number; detailCandidates: number; agencyEligible: number }) {
  const explanations: string[] = [];
  const { stats, scored } = input;
  if ((stats.providerMissingWarnings ?? 0) > 0) explanations.push("Broad provider discovery is limited because BRAVE_SEARCH_API_KEY is missing.");
  if ((stats.listingPagesSuppressed ?? 0) > 0) explanations.push(`${stats.listingPagesSuppressed} listing/search page result${stats.listingPagesSuppressed === 1 ? " was" : "s were"} suppressed before scoring.`);
  if ((stats.jobsBelowThreshold ?? 0) > Math.max(5, scored * 0.5)) explanations.push("Most scored jobs are below the active profile thresholds; broaden profiles or lower review thresholds to see more candidates.");
  if ((stats.profileMaxResultsCapped ?? 0) > 0) explanations.push("At least one profile hit maxResultsPerRun, so additional qualified jobs were intentionally left out of this run.");
  if ((stats.reviewOnlyMatches ?? 0) > 0) explanations.push(`${stats.reviewOnlyMatches} broad-search match${stats.reviewOnlyMatches === 1 ? " is" : "es are"} held for manual review instead of auto-prep.`);
  if ((stats.jobsMissingApplicationUrl ?? 0) > 0) explanations.push(`${stats.jobsMissingApplicationUrl} saved match${stats.jobsMissingApplicationUrl === 1 ? " lacks" : "es lack"} an application URL, so Apply Sprint cannot prepare them yet.`);
  if (!explanations.length && stats.jobsFetched > 0) explanations.push("No dominant blocker was detected; review the profile and source charts for smaller yield patterns.");
  return explanations.slice(0, 4);
}

function shortDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
