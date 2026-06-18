import { applicationMaterialQualityDetail } from "@/lib/applications/material-quality";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { visibleCanonicalApplications } from "@/lib/applications/reconciliation";
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
    latestSearchRun,
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
    needsJobs ? prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }) : Promise.resolve(null),
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
      latestSearchRun: latestSearchRun
        ? {
            id: latestSearchRun.id,
            status: latestSearchRun.status,
            jobsFetched: latestSearchRun.jobsFetched,
            jobsAfterDedupe: latestSearchRun.jobsAfterDedupe,
            jobsSaved: latestSearchRun.jobsSaved,
            startedAt: latestSearchRun.startedAt.toISOString(),
            finishedAt: latestSearchRun.finishedAt?.toISOString() ?? null,
          }
        : null,
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
