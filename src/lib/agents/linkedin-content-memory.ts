import type { Prisma } from "@prisma/client";
import { buildSearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { sourceCatalog } from "@/lib/job-search/source-catalog";
import { prisma } from "@/lib/prisma";

export type LinkedInContentMemoryPack = {
  generatedAt: string;
  publicPolicy: string;
  aggregateFacts: string[];
  recentDecisions: string[];
  lessonsLearned: string[];
  storyAngles: string[];
  doNotClaim: string[];
  screenshotRecommendations: Array<{ route: string; reason: string }>;
  analytics: {
    latestSearchRun: ReturnType<typeof buildSearchRunAnalytics> | null;
    applicationStatusCounts: Record<string, number>;
    outcomeCounts: Record<string, number>;
    agentRunCounts: Record<string, number>;
    sourceCoverage: {
      activeSources: number;
      querySources: number;
      manualSources: number;
      priorityOneSources: number;
    };
  };
  memorySources: Array<{ type: string; ref: string; label: string }>;
  analyticsSources: Array<{ type: string; ref: string; label: string }>;
};

export async function buildLinkedInContentMemoryPack(userId: string): Promise<LinkedInContentMemoryPack> {
  const [latestSearchRun, recentSearchRuns, recentAgentRuns, applicationsByStatus, outcomesByType, activeAdjustments, priorDrafts] = await Promise.all([
    prisma.jobSearchRun.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.jobSearchRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.agentRun.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, agentType: true, outputJson: true, createdAt: true },
    }),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    prisma.applicationOutcome.groupBy({ by: ["outcome"], where: { userId }, _count: { _all: true } }),
    prisma.skillAdjustment.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, skillId: true, rationale: true },
    }),
    prisma.linkedInPostDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, updatedAt: true, publishError: true },
    }),
  ]);

  const activeSources = sourceCatalog.filter((item) => item.status === "active");
  const querySources = sourceCatalog.filter((item) => item.connector === "search_query");
  const manualSources = sourceCatalog.filter((item) => item.status === "manual");
  const latestAnalytics = latestSearchRun
    ? buildSearchRunAnalytics({
      jobsFetched: latestSearchRun.jobsFetched,
      jobsAfterDedupe: latestSearchRun.jobsAfterDedupe,
      jobsAfterFilters: latestSearchRun.jobsAfterFilters,
      jobsSaved: latestSearchRun.jobsSaved,
      progress: latestSearchRun.progress,
    })
    : null;
  const applicationStatusCounts = countMap(applicationsByStatus, "status");
  const outcomeCounts = countMap(outcomesByType, "outcome");
  const agentRunCounts = recentAgentRuns.reduce<Record<string, number>>((acc, run) => {
    acc[run.agentType] = (acc[run.agentType] ?? 0) + 1;
    return acc;
  }, {});

  const aggregateFacts = [
    latestAnalytics
      ? `Latest search funnel: ${latestAnalytics.funnel.map((item) => `${item.label} ${item.value}`).join(", ")}.`
      : "No search run analytics are available yet.",
    latestAnalytics?.drops.length
      ? `Main drop-off reasons were ${latestAnalytics.drops.slice(0, 4).map((item) => `${item.label} ${item.value}`).join(", ")}.`
      : "No major search drop-off reason was recorded in the latest run.",
    `Application status mix: ${formatCounts(applicationStatusCounts) || "no applications tracked yet"}.`,
    `Outcome signals: ${formatCounts(outcomeCounts) || "no explicit outcomes recorded yet"}.`,
    `Source coverage includes ${activeSources.length} active sources, ${querySources.length} query-covered sources, ${manualSources.length} manual sources, and ${sourceCatalog.filter((item) => item.priority === 1).length} priority-one sources.`,
  ];

  return {
    generatedAt: new Date().toISOString(),
    publicPolicy: "Aggregate analytics only. Do not publish company names, job URLs, salaries, recruiters, emails, application-specific outcomes, or private user data.",
    aggregateFacts,
    recentDecisions: [
      "LinkedIn publishing requires explicit user approval and the w_member_social scope.",
      "Job Search OS keeps high-impact external actions behind review and provenance gates.",
      ...activeAdjustments.map((item) => `Active learning for ${item.skillId}: ${item.rationale}`),
    ].slice(0, 8),
    lessonsLearned: [
      "The interesting product story is workflow clarity: fetch, filter, prepare, review, publish, and learn.",
      "Useful agents need memory, source provenance, and blocked-claim rules before they can be trusted with public output.",
      ...(latestAnalytics?.explanations ?? []),
    ].slice(0, 8),
    storyAngles: [
      "A creator operating system should turn work history and analytics into reviewable content, not force humans to start from a blank page.",
      "The same gating patterns used for job applications can make AI-assisted publishing safer.",
      "Aggregate funnel analytics can tell a useful product story without exposing private job-search details.",
    ],
    doNotClaim: [
      "Do not claim LinkedIn job-search, saved-job, Apply Connect, or auto-apply API access.",
      "Do not name companies, recruiters, salaries, job URLs, email addresses, or specific application outcomes.",
      "Do not imply production customer traction, revenue, or external adoption unless a future approved source exists.",
    ],
    screenshotRecommendations: [
      { route: "/dashboard", reason: "Shows the command surface and aggregate workflow status." },
      { route: "/sources", reason: "Shows source coverage and provider boundaries." },
      { route: "/applications/assistant", reason: "Shows Apply Sprint workflow controls and human gates." },
      { route: "/linkedin-content", reason: "Shows the emerging content operating system itself." },
    ],
    analytics: {
      latestSearchRun: latestAnalytics,
      applicationStatusCounts,
      outcomeCounts,
      agentRunCounts,
      sourceCoverage: {
        activeSources: activeSources.length,
        querySources: querySources.length,
        manualSources: manualSources.length,
        priorityOneSources: sourceCatalog.filter((item) => item.priority === 1).length,
      },
    },
    memorySources: [
      ...recentAgentRuns.map((run) => ({ type: "agent_run", ref: run.id, label: `${run.agentType} completed ${run.createdAt.toISOString()}` })),
      ...activeAdjustments.map((item) => ({ type: "skill_adjustment", ref: item.id, label: `${item.skillId}: ${item.rationale.slice(0, 120)}` })),
      ...priorDrafts.map((draft) => ({ type: "linkedin_draft", ref: draft.id, label: `${draft.status}: ${draft.title}` })),
    ].slice(0, 24),
    analyticsSources: [
      ...recentSearchRuns.map((run) => ({ type: "search_run", ref: run.id, label: `${run.status}: fetched ${run.jobsFetched}, saved ${run.jobsSaved}` })),
      { type: "application_counts", ref: userId, label: formatCounts(applicationStatusCounts) || "No application counts" },
      { type: "outcome_counts", ref: userId, label: formatCounts(outcomeCounts) || "No outcome counts" },
    ],
  };
}

function countMap<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key]);
    const count = item._count as { _all?: number } | undefined;
    acc[value] = count?._all ?? 0;
    return acc;
  }, {});
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
