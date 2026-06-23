import { applicationMaterialQualityDetail } from "@/lib/applications/material-quality";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { visibleCanonicalApplications } from "@/lib/applications/reconciliation";
import { buildSearchRunAnalytics, type SearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { getLatestEmailOpsSummary } from "@/lib/jolene/email-ops";
import { classifyJoleneReadOnlyQuestion, type JoleneReadOnlyDomain, type JoleneReadOnlyRoute } from "@/lib/jolene/router";
import type { JoleneResultLink } from "@/lib/jolene/retrieval";
import { prisma } from "@/lib/prisma";

export type JoleneStateQueryResult = {
  handled: boolean;
  reply?: string;
  actionJson?: {
    action: "jolene_state_query";
    route: JoleneReadOnlyRoute;
    checkedSources: JoleneReadOnlyDomain[];
    facts: string[];
    blockers: string[];
    recommendedActions: string[];
    resultLinks: JoleneResultLink[];
    data: Record<string, unknown>;
  };
  clientAction?: { type: "navigate"; href: string; refresh?: boolean };
};

export async function executeJoleneStateQuery(message: string, options: { userId?: string | null; route?: JoleneReadOnlyRoute | null } = {}): Promise<JoleneStateQueryResult> {
  if (!options.userId) return { handled: false };

  const route = options.route ?? await classifyJoleneReadOnlyQuestion(message);
  if (!route) return { handled: false };

  const state = await buildStateQueryContext(options.userId, route.domains);
  const answer = synthesizeStateQueryAnswer(message, route, state);

  return {
    handled: true,
    reply: answer.reply,
    actionJson: {
      action: "jolene_state_query",
      route,
      checkedSources: route.domains,
      facts: answer.facts,
      blockers: answer.blockers,
      recommendedActions: answer.recommendedActions,
      resultLinks: answer.resultLinks,
      data: state,
    },
    clientAction: answer.primaryLink ? { type: "navigate", href: answer.primaryLink.href, refresh: true } : undefined,
  };
}

async function buildStateQueryContext(userId: string, domains: JoleneReadOnlyDomain[]) {
  const domainSet = new Set(domains);
  const needsApplications = hasAny(domainSet, ["dashboard", "apply_sprint", "applications"]);
  const needsJobs = hasAny(domainSet, ["dashboard", "jobs", "search", "profiles"]);
  const needsAgents = hasAny(domainSet, ["dashboard", "agents"]);
  const needsEmail = domainSet.has("email_ops");
  const needsEvidence = hasAny(domainSet, ["evidence", "profiles"]);
  const needsMarket = domainSet.has("market");

  const [
    applicationCounts,
    readyApplications,
    packetNeedsReview,
    openBlockers,
    followUpsDue,
    matchCounts,
    recentSearchRuns,
    profiles,
    duplicateGroups,
    suppressions,
    recentRuns,
    agentFailures,
    emailOps,
    evidenceCounts,
    marketRun,
  ] = await Promise.all([
    needsApplications ? prisma.application.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }) : Promise.resolve([]),
    needsApplications ? prisma.application.findMany({
      where: { userId, status: "ready_to_apply" },
      include: {
        coverLetter: { select: { generationNotes: true } },
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            location: true,
            applicationUrl: true,
            lastSeenAt: true,
            duplicateGroupId: true,
          },
        },
        jobProfileMatch: { select: { overallScore: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }) : Promise.resolve([]),
    needsApplications ? prisma.applicationPacket.count({ where: { userId, status: { in: ["DRAFT", "NEEDS_REVIEW"] } } }) : Promise.resolve(0),
    needsApplications || needsAgents ? prisma.agentUserRequest.count({ where: { userId, status: "OPEN" } }) : Promise.resolve(0),
    needsApplications ? prisma.application.count({
      where: {
        userId,
        OR: [
          { status: "follow_up_due" },
          { followUpAt: { lte: new Date() } },
        ],
      },
    }) : Promise.resolve(0),
    needsJobs ? prisma.jobProfileMatch.groupBy({ by: ["status"], where: { jobSearchProfile: { userId } }, _count: { _all: true } }) : Promise.resolve([]),
    needsJobs ? prisma.jobSearchRun.findMany({
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        profileIds: true,
        jobsFetched: true,
        jobsAfterDedupe: true,
        jobsAfterFilters: true,
        jobsSaved: true,
        progress: true,
        errors: true,
        startedAt: true,
        finishedAt: true,
      },
      orderBy: { startedAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    needsJobs ? prisma.jobSearchProfile.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        enabled: true,
        scheduleEnabled: true,
        minimumMatchScore: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }) : Promise.resolve([]),
    needsJobs ? prisma.jobPosting.groupBy({ by: ["duplicateGroupId"], where: { duplicateGroupId: { not: null } }, _count: { _all: true } }) : Promise.resolve([]),
    needsJobs ? prisma.jobSuppression.count({ where: { userId } }) : Promise.resolve(0),
    needsAgents ? prisma.agentRun.findMany({
      where: { userId },
      select: { id: true, agentType: true, status: true, error: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    needsAgents ? prisma.agentRun.count({ where: { userId, status: "FAILED" } }) : Promise.resolve(0),
    needsEmail ? getLatestEmailOpsSummary(userId) : Promise.resolve(null),
    needsEvidence ? prisma.candidateEvidence.groupBy({ by: ["confidence"], where: { candidateProfile: { userId } }, _count: { _all: true } }) : Promise.resolve([]),
    needsMarket ? prisma.agentRun.findFirst({
      where: { userId, agentType: "MARKET_INTELLIGENCE" },
      select: { id: true, status: true, outputJson: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }) : Promise.resolve(null),
  ]);

  const canonicalReady = visibleCanonicalApplications<(typeof readyApplications)[number]>(readyApplications);
  const launchableReady = canonicalReady.filter((application) => (
    assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable
    && applicationMaterialQualityDetail(application.coverLetter?.generationNotes).launchable
  ));
  const urlBlocked = canonicalReady.filter((application) => !assessApplicationUrlQuality(application.jobPosting.applicationUrl).launchable);
  const materialBlocked = canonicalReady.filter((application) => !applicationMaterialQualityDetail(application.coverLetter?.generationNotes).launchable);
  const visibleReady = canonicalReady;
  const searchRuns = recentSearchRuns.map((run) => summarizeSearchRun(run));
  const latestSearchRun = searchRuns[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    applications: {
      byStatus: countsByKey(applicationCounts, "status"),
      packetsNeedingReview: packetNeedsReview,
      openBlockers,
      followUpsDue,
      applySprint: {
        visibleReady: visibleReady.length,
        launchableReady: launchableReady.length,
        canonicalReady: canonicalReady.length,
        rawReady: readyApplications.length,
        urlBlocked: urlBlocked.length,
        materialBlocked: materialBlocked.length,
        examples: visibleReady.slice(0, 5).map((application) => ({
          id: application.id,
          href: `/applications/${application.id}`,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          score: application.jobProfileMatch?.overallScore ?? null,
        })),
      },
    },
    jobs: {
      byStatus: countsByKey(matchCounts, "status"),
      duplicateGroups: duplicateGroups.filter((group) => group._count._all > 1).length,
      suppressions,
      latestSearchRun,
      recentSearchRuns: searchRuns,
      profiles: {
        enabled: profiles.filter((profile) => profile.enabled).length,
        disabled: profiles.filter((profile) => !profile.enabled).length,
        scheduled: profiles.filter((profile) => profile.scheduleEnabled).length,
        names: profiles.slice(0, 6).map((profile) => profile.name),
      },
    },
    agents: {
      recentFailures: agentFailures,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        agentType: run.agentType,
        status: run.status,
        error: run.error,
        updatedAt: run.updatedAt.toISOString(),
      })),
    },
    emailOps: emailOps
      ? {
          latestRunId: emailOps.latestRun?.id ?? null,
          latestRunStatus: emailOps.latestRun?.status ?? null,
          summary: emailOps.summary?.summary ?? null,
          scanned: emailOps.summary?.scanned ?? null,
          findingsCreated: emailOps.summary?.findingsCreated ?? null,
          needsApproval: emailOps.summary?.needsApproval ?? null,
          pendingCalendarDrafts: emailOps.pendingCalendarProposals.length,
          recentFindings: emailOps.findings.slice(0, 5).map((finding) => ({
            id: finding.id,
            status: finding.status,
            classification: finding.classification,
            confidenceScore: finding.confidenceScore,
            subject: finding.emailMessage?.subject ?? null,
            company: finding.matchedApplication?.jobPosting.company ?? finding.matchedJobPosting?.company ?? null,
          })),
        }
      : null,
    evidence: {
      byConfidence: countsByKey(evidenceCounts, "confidence"),
    },
    market: marketRun
      ? {
          latestRunId: marketRun.id,
          status: marketRun.status,
          updatedAt: marketRun.updatedAt.toISOString(),
          summary: summarizeMarketOutput(marketRun.outputJson),
        }
      : null,
  };
}

function synthesizeStateQueryAnswer(
  message: string,
  route: JoleneReadOnlyRoute,
  state: Awaited<ReturnType<typeof buildStateQueryContext>>,
) {
  const searchWhyAnswer = synthesizeSearchRunWhyAnswer(message, route, state);
  if (searchWhyAnswer) return searchWhyAnswer;

  const facts = stateFacts(route, state);
  const blockers = stateBlockers(route, state);
  const recommendedActions = stateRecommendations(route, state);
  const resultLinks = stateLinks(route, state);

  const reply = [
    route.questionKind === "count" ? countLead(route, state) : null,
    facts.length ? `I checked ${route.domains.map(humanDomain).join(", ")}. ${facts.join(" ")}` : `I checked ${route.domains.map(humanDomain).join(", ")}.`,
    blockers.length ? `Blocking or attention-needed items: ${blockers.join(" ")}` : null,
    recommendedActions.length ? `Next: ${recommendedActions.join(" ")}` : null,
  ].filter(Boolean).join("\n\n");

  return {
    reply,
    facts,
    blockers,
    recommendedActions,
    resultLinks,
    primaryLink: resultLinks[0] ?? null,
  };
}

function synthesizeSearchRunWhyAnswer(
  message: string,
  route: JoleneReadOnlyRoute,
  state: Awaited<ReturnType<typeof buildStateQueryContext>>,
) {
  if (route.questionKind !== "why") return null;
  if (!hasAny(new Set(route.domains), ["jobs", "search", "profiles"])) return null;
  if (!isSearchCausalQuestion(message)) return null;

  const latest = state.jobs.latestSearchRun;
  if (!latest) return null;

  const priorRuns = state.jobs.recentSearchRuns.slice(1);
  const previous = priorRuns[0] ?? null;
  const baseline = previous ?? averageSearchRunBaseline(priorRuns);
  const comparison = baseline ? compareSearchRuns(latest, baseline) : null;
  const fetchedToDedupe = rate(latest.jobsAfterDedupe, latest.jobsFetched);
  const fetchedToQualified = rate(latest.jobsAfterFilters, latest.jobsFetched);
  const fetchedToSaved = rate(latest.jobsSaved, latest.jobsFetched);
  const usefulYieldLow = latest.jobsFetched > 0 && (
    fetchedToSaved < 1
    || fetchedToQualified < 1
    || latest.jobsAfterDedupe < latest.jobsFetched * 0.02
  );

  const facts = [
    usefulYieldLow
      ? "The fetched count jumped, but the useful-yield counters did not grow proportionally."
      : "The latest search run increased raw fetched volume; useful-yield counters need to be compared separately.",
    `Current run: ${formatNumber(latest.jobsFetched)} fetched, ${formatNumber(latest.jobsAfterDedupe)} after dedupe, ${formatNumber(latest.jobsSaved)} saved.`,
  ];
  if (latest.jobsAfterFilters !== latest.jobsAfterDedupe) {
    facts.push(`${formatNumber(latest.jobsAfterFilters)} passed filters/qualification before final dedupe and save handling.`);
  }
  if (comparison) {
    facts.push(`Compared with ${comparison.label}, fetched changed by ${formatSignedNumber(comparison.deltaFetched)} (${formatSignedPercent(comparison.percentFetched)}), while saved changed by ${formatSignedNumber(comparison.deltaSaved)} and after-dedupe changed by ${formatSignedNumber(comparison.deltaDedupe)}.`);
  } else {
    facts.push("There is not enough prior search-run history to calculate a baseline, so this answer uses only the latest run counters and diagnostics.");
  }
  facts.push(`Useful-yield rates: ${formatPercent(fetchedToDedupe)} after dedupe, ${formatPercent(fetchedToQualified)} qualified, ${formatPercent(fetchedToSaved)} saved from fetched.`);

  const evidence = rankedSearchRunCauses(latest);
  const blockers = [
    ...evidence,
    ...(!latest.progressDiagnosticsAvailable
      ? ["The latest run does not include source/profile progress diagnostics, so I can compare counters but cannot isolate the exact source or profile that caused the spike."]
      : []),
  ].slice(0, 5);
  const recommendedActions = [
    "Open /dashboard/search and inspect source yield for the latest run.",
    "Open /profiles and compare profile yield, enabled/scheduled profile count, and max-result caps.",
    "Open /runs and review query expansion, listing suppression, provider warnings, and below-threshold volume.",
    "Run the Recruiting Search Team only if the problem is low qualified/saved yield, not simply high raw fetch volume.",
  ];
  const resultLinks: JoleneResultLink[] = [
    { label: "Search diagnostics", href: "/dashboard/search?details=open", kind: "page" },
    { label: "Profiles", href: "/profiles", kind: "page" },
    { label: "Runs", href: "/runs", kind: "page" },
  ];

  const reply = [
    facts.join(" "),
    blockers.length ? `Likely causes, ranked by evidence: ${blockers.join(" ")}` : null,
    `Next checks: ${recommendedActions.slice(0, 3).join(" ")}`,
  ].filter(Boolean).join("\n\n");

  return {
    reply,
    facts,
    blockers,
    recommendedActions,
    resultLinks,
    primaryLink: resultLinks[0],
  };
}

type SearchRunRecord = {
  id: string;
  status: unknown;
  triggeredBy: unknown;
  profileIds: unknown;
  jobsFetched: number;
  jobsAfterDedupe: number;
  jobsAfterFilters: number;
  jobsSaved: number;
  progress: unknown;
  errors: unknown;
  startedAt: Date;
  finishedAt: Date | null;
};

type SearchRunSummary = ReturnType<typeof summarizeSearchRun>;

function summarizeSearchRun(run: SearchRunRecord) {
  const analytics = buildSearchRunAnalytics(run);
  return {
    id: run.id,
    status: String(run.status),
    triggeredBy: String(run.triggeredBy),
    profileIds: arrayOfStrings(run.profileIds),
    jobsFetched: run.jobsFetched ?? 0,
    jobsAfterDedupe: run.jobsAfterDedupe ?? 0,
    jobsAfterFilters: run.jobsAfterFilters ?? 0,
    jobsSaved: run.jobsSaved ?? 0,
    errors: arrayOfStrings(run.errors),
    progressDiagnosticsAvailable: hasProgressStats(run.progress),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    analytics: compactSearchRunAnalytics(analytics),
  };
}

function compactSearchRunAnalytics(analytics: SearchRunAnalytics) {
  return {
    stats: analytics.stats,
    topBlocker: analytics.topBlocker,
    bestSource: analytics.bestSource,
    bestProfile: analytics.bestProfile,
    runQuality: analytics.runQuality,
    bySource: analytics.bySource,
    byProfile: analytics.byProfile,
    sourceYield: analytics.sourceYield,
    profileYield: analytics.profileYield,
    drops: analytics.drops.slice(0, 6),
    explanations: analytics.explanations,
  };
}

function hasProgressStats(progress: unknown) {
  return Array.isArray(progress) && progress.some((event) => (
    event && typeof event === "object" && !Array.isArray(event) && typeof (event as { stats?: unknown }).stats === "object"
  ));
}

function isSearchCausalQuestion(message: string) {
  const normalized = message.toLowerCase();
  return /\b(search|runs?|fetched|fetching|jobs?|yield|source|sources|profiles?|dedupe|filters?|qualified|saved|scoring|threshold|increase|increased|jump|jumped|spike|spiked|change|changed|many|volume)\b/.test(normalized);
}

function averageSearchRunBaseline(runs: SearchRunSummary[]) {
  if (!runs.length) return null;
  return {
    id: "recent_average",
    label: `the recent average of ${runs.length} run${runs.length === 1 ? "" : "s"}`,
    jobsFetched: average(runs.map((run) => run.jobsFetched)),
    jobsAfterDedupe: average(runs.map((run) => run.jobsAfterDedupe)),
    jobsAfterFilters: average(runs.map((run) => run.jobsAfterFilters)),
    jobsSaved: average(runs.map((run) => run.jobsSaved)),
  };
}

function compareSearchRuns(
  latest: SearchRunSummary,
  baseline: SearchRunSummary | NonNullable<ReturnType<typeof averageSearchRunBaseline>>,
) {
  const label = "label" in baseline ? baseline.label : "the previous run";
  return {
    label,
    deltaFetched: latest.jobsFetched - baseline.jobsFetched,
    deltaDedupe: latest.jobsAfterDedupe - baseline.jobsAfterDedupe,
    deltaSaved: latest.jobsSaved - baseline.jobsSaved,
    percentFetched: percentChange(latest.jobsFetched, baseline.jobsFetched),
  };
}

function rankedSearchRunCauses(latest: SearchRunSummary) {
  const causes: string[] = [];
  const stats = latest.analytics.stats;
  const fetchedToDedupe = rate(latest.jobsAfterDedupe, latest.jobsFetched);
  const fetchedToSaved = rate(latest.jobsSaved, latest.jobsFetched);

  if (latest.jobsFetched > 0 && (fetchedToDedupe < 2 || fetchedToSaved < 1)) {
    causes.push(`Most of the spike looks like raw discovery noise or filtering pressure: only ${formatPercent(fetchedToDedupe)} reached after-dedupe and ${formatPercent(fetchedToSaved)} became saved matches.`);
  }

  const topFetchedSource = latest.analytics.bySource.slice().sort((left, right) => right.fetched - left.fetched)[0];
  if (topFetchedSource) {
    causes.push(`Source diagnostics point first to ${topFetchedSource.label}: ${formatNumber(topFetchedSource.fetched)} fetched, ${formatNumber(topFetchedSource.qualified)} qualified, ${formatNumber(topFetchedSource.saved)} saved.`);
  }

  const topFetchedProfile = latest.analytics.byProfile.slice().sort((left, right) => right.fetched - left.fetched)[0];
  if (topFetchedProfile) {
    causes.push(`Profile diagnostics point first to ${topFetchedProfile.label}: ${formatNumber(topFetchedProfile.fetched)} fetched, ${formatNumber(topFetchedProfile.qualified)} qualified, ${formatNumber(topFetchedProfile.saved)} saved${topFetchedProfile.capped ? `, with ${formatNumber(topFetchedProfile.capped)} cap hit${topFetchedProfile.capped === 1 ? "" : "s"}` : ""}.`);
  }

  if ((stats.searchQueryExpandedLinks ?? 0) > 0) {
    causes.push(`Search-query expansion produced ${formatNumber(stats.searchQueryExpandedLinks ?? 0)} expanded link${stats.searchQueryExpandedLinks === 1 ? "" : "s"}, which can raise raw fetched volume before quality filters run.`);
  }
  if ((stats.listingPagesSuppressed ?? 0) > 0) {
    causes.push(`${formatNumber(stats.listingPagesSuppressed ?? 0)} listing/search page result${stats.listingPagesSuppressed === 1 ? " was" : "s were"} suppressed, which suggests broad source coverage is bringing in listing-page noise.`);
  }
  if ((stats.providerMissingWarnings ?? 0) > 0) {
    causes.push(`${formatNumber(stats.providerMissingWarnings ?? 0)} provider warning${stats.providerMissingWarnings === 1 ? "" : "s"} appeared; check whether provider configuration changed discovery behavior.`);
  }
  if ((stats.profileMaxResultsCapped ?? 0) > 0) {
    causes.push(`${formatNumber(stats.profileMaxResultsCapped ?? 0)} profile max-result cap hit${stats.profileMaxResultsCapped === 1 ? "" : "s"} appeared, so profile breadth or cap settings affected the run.`);
  }
  if ((stats.jobsBelowThreshold ?? 0) > 0) {
    causes.push(`${formatNumber(stats.jobsBelowThreshold ?? 0)} job${stats.jobsBelowThreshold === 1 ? "" : "s"} were below threshold, so the high fetch count is not translating into qualified yield.`);
  }
  if ((stats.existingJobDuplicates ?? 0) + (stats.existingProfileMatches ?? 0) > 0) {
    causes.push(`${formatNumber((stats.existingJobDuplicates ?? 0) + (stats.existingProfileMatches ?? 0))} duplicate or existing match${((stats.existingJobDuplicates ?? 0) + (stats.existingProfileMatches ?? 0)) === 1 ? "" : "es"} were detected, which points to rediscovery rather than new opportunity.`);
  }
  if ((stats.reviewOnlyMatches ?? 0) > 0) {
    causes.push(`${formatNumber(stats.reviewOnlyMatches ?? 0)} broad match${stats.reviewOnlyMatches === 1 ? " is" : "es are"} review-only, so useful yield may be waiting on manual triage rather than Apply Sprint.`);
  }

  return Array.from(new Set(causes));
}

function countLead(route: JoleneReadOnlyRoute, state: Awaited<ReturnType<typeof buildStateQueryContext>>) {
  if (route.domains.includes("apply_sprint")) {
    return `Apply Sprint has ${state.applications.applySprint.visibleReady} ready job${state.applications.applySprint.visibleReady === 1 ? "" : "s"} in the visible queue.`;
  }
  if (route.domains.includes("applications")) {
    const total = Object.values(state.applications.byStatus).reduce((sum, value) => sum + value, 0);
    return `There are ${total} application tracker${total === 1 ? "" : "s"} in the app.`;
  }
  if (route.domains.includes("jobs") || route.domains.includes("search")) {
    const total = Object.values(state.jobs.byStatus).reduce((sum, value) => sum + value, 0);
    return `There are ${total} scored job match${total === 1 ? "" : "es"} in the local pipeline.`;
  }
  if (route.domains.includes("agents")) return `${state.agents.recentFailures} agent run${state.agents.recentFailures === 1 ? " has" : "s have"} failed.`;
  return null;
}

function stateFacts(route: JoleneReadOnlyRoute, state: Awaited<ReturnType<typeof buildStateQueryContext>>) {
  const facts: string[] = [];
  if (route.domains.includes("apply_sprint")) {
    const sprint = state.applications.applySprint;
    facts.push(`${sprint.canonicalReady} canonical ready_to_apply tracker${sprint.canonicalReady === 1 ? "" : "s"}; ${sprint.rawReady} raw ready_to_apply tracker${sprint.rawReady === 1 ? "" : "s"}; ${sprint.launchableReady} launchable in the browser-assistant subset.`);
    if (sprint.examples.length) facts.push(`Top visible items: ${sprint.examples.map((item) => `${item.company} - ${item.title}`).join("; ")}.`);
  }
  if (route.domains.includes("applications")) {
    facts.push(`Application statuses: ${formatCounts(state.applications.byStatus) || "none"}.`);
    facts.push(`${state.applications.packetsNeedingReview} packet${state.applications.packetsNeedingReview === 1 ? "" : "s"} need review; ${state.applications.followUpsDue} follow-up${state.applications.followUpsDue === 1 ? "" : "s"} are due.`);
  }
  if (route.domains.includes("jobs") || route.domains.includes("search") || route.domains.includes("profiles")) {
    facts.push(`Job match statuses: ${formatCounts(state.jobs.byStatus) || "none"}.`);
    facts.push(`${state.jobs.profiles.enabled} enabled profile${state.jobs.profiles.enabled === 1 ? "" : "s"}, ${state.jobs.profiles.scheduled} scheduled.`);
    if (state.jobs.latestSearchRun) facts.push(`Latest search run ${state.jobs.latestSearchRun.status}: ${state.jobs.latestSearchRun.jobsFetched} fetched, ${state.jobs.latestSearchRun.jobsAfterDedupe} after dedupe, ${state.jobs.latestSearchRun.jobsSaved} saved.`);
  }
  if (route.domains.includes("agents")) {
    facts.push(`${state.agents.recentRuns.length} recent run${state.agents.recentRuns.length === 1 ? "" : "s"} loaded; ${state.agents.recentFailures} failed run${state.agents.recentFailures === 1 ? "" : "s"} recorded.`);
  }
  if (route.domains.includes("email_ops") && state.emailOps) {
    facts.push(`Email Ops latest summary: ${state.emailOps.summary ?? "no completed summary"}. Findings created: ${state.emailOps.findingsCreated ?? 0}; approval-needed: ${state.emailOps.needsApproval ?? 0}; calendar drafts: ${state.emailOps.pendingCalendarDrafts}.`);
  }
  if (route.domains.includes("evidence")) {
    facts.push(`Evidence confidence counts: ${formatCounts(state.evidence.byConfidence) || "none"}.`);
  }
  if (route.domains.includes("market")) {
    facts.push(state.market ? `Latest market intelligence run ${state.market.status}: ${state.market.summary ?? "summary unavailable"}.` : "No market intelligence run is recorded.");
  }
  return facts;
}

function stateBlockers(route: JoleneReadOnlyRoute, state: Awaited<ReturnType<typeof buildStateQueryContext>>) {
  const blockers: string[] = [];
  if (state.applications.openBlockers > 0) blockers.push(`${state.applications.openBlockers} open Needs Me blocker${state.applications.openBlockers === 1 ? "" : "s"}.`);
  if (route.domains.includes("apply_sprint")) {
    if (state.applications.applySprint.urlBlocked > 0) blockers.push(`${state.applications.applySprint.urlBlocked} ready tracker${state.applications.applySprint.urlBlocked === 1 ? " has" : "s have"} non-launchable application URLs.`);
    if (state.applications.applySprint.materialBlocked > 0) blockers.push(`${state.applications.applySprint.materialBlocked} ready tracker${state.applications.applySprint.materialBlocked === 1 ? " has" : "s have"} material-quality blockers.`);
  }
  if ((route.domains.includes("jobs") || route.domains.includes("search")) && state.jobs.duplicateGroups > 0) blockers.push(`${state.jobs.duplicateGroups} duplicate group${state.jobs.duplicateGroups === 1 ? "" : "s"} are recorded.`);
  if (route.domains.includes("agents") && state.agents.recentFailures > 0) blockers.push(`${state.agents.recentFailures} failed agent run${state.agents.recentFailures === 1 ? "" : "s"} need inspection.`);
  return blockers;
}

function stateRecommendations(route: JoleneReadOnlyRoute, state: Awaited<ReturnType<typeof buildStateQueryContext>>) {
  const actions: string[] = [];
  if (state.applications.openBlockers > 0) actions.push("Open /needs-me and clear the oldest blocker.");
  if (route.domains.includes("apply_sprint")) {
    if (state.applications.applySprint.visibleReady > 0) actions.push("Open /applications/assistant and work the visible Apply Sprint queue.");
    else actions.push("Open /jobs to approve high-fit matches or run the Recruiting Search Team to prepare new Apply Sprint items.");
  }
  if (route.domains.includes("search") || route.domains.includes("profiles")) actions.push("Review /profiles before broadening sources or lowering match thresholds.");
  if (route.domains.includes("agents") && state.agents.recentFailures > 0) actions.push("Open /agents and inspect the latest failed run before starting more work.");
  if (route.domains.includes("email_ops") && (state.emailOps?.needsApproval ?? 0) > 0) actions.push("Open /dashboard/email-ops and review approval-needed findings.");
  return Array.from(new Set(actions)).slice(0, 4);
}

function stateLinks(route: JoleneReadOnlyRoute, state: Awaited<ReturnType<typeof buildStateQueryContext>>): JoleneResultLink[] {
  const links: JoleneResultLink[] = [];
  if (route.domains.includes("apply_sprint")) links.push({ label: "Open Apply Sprint", href: "/applications/assistant", kind: "page" });
  if (route.domains.includes("applications")) links.push({ label: "Applications", href: "/applications", kind: "page" });
  if (route.domains.includes("jobs") || route.domains.includes("search")) links.push({ label: "Jobs", href: "/jobs", kind: "page" });
  if (route.domains.includes("profiles")) links.push({ label: "Profiles", href: "/profiles", kind: "page" });
  if (route.domains.includes("agents")) links.push({ label: "Agents", href: "/agents", kind: "page" });
  if (route.domains.includes("email_ops")) links.push({ label: "Email Ops", href: "/dashboard/email-ops", kind: "page" });
  for (const item of state.applications.applySprint.examples) links.push({ label: item.company, href: item.href, kind: "page" });
  return dedupeLinks(links).slice(0, 6);
}

function hasAny(set: Set<JoleneReadOnlyDomain>, values: JoleneReadOnlyDomain[]) {
  return values.some((value) => set.has(value));
}

function countsByKey<T extends { _count: { _all: number } }>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[String(item[key])] = item._count._all;
    return acc;
  }, {});
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([status, count]) => `${status.replace(/_/g, " ")} ${count}`)
    .join(", ");
}

function arrayOfStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(value: number, total: number) {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatSignedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `-${formatNumber(Math.abs(value))}`;
  return "0";
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10}%`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) return "no prior percentage baseline";
  if (value > 0) return `+${formatPercent(value)}`;
  if (value < 0) return `-${formatPercent(Math.abs(value))}`;
  return "0%";
}

function summarizeMarketOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = "summary" in value && typeof value.summary === "string" ? value.summary : null;
  return summary ?? null;
}

function humanDomain(domain: JoleneReadOnlyDomain) {
  return domain.replace(/_/g, " ");
}

function dedupeLinks(links: JoleneResultLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}
