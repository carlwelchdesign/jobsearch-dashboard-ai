import type { Prisma } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { buildSearchRunAnalytics } from "@/lib/job-search/run-analytics";
import { sourceCatalog } from "@/lib/job-search/source-catalog";
import { getLinkedInAnalyticsSummary } from "@/lib/linkedin/analytics";
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
  planSources: Array<{ filename: string; title: string; summary: string; themes: string[] }>;
  noveltySignals: {
    recentHooks: string[];
    recentTitles: string[];
    recentPillars: string[];
    recentScreenshotRoutes: string[];
    avoidPhrases: string[];
  };
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
  const [latestSearchRun, recentSearchRuns, recentAgentRuns, applicationsByStatus, outcomesByType, activeAdjustments, priorDrafts, linkedInAnalytics, planSources] = await Promise.all([
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
      select: { id: true, title: true, hook: true, contentPillar: true, selectedScreenshots: true, status: true, updatedAt: true, publishError: true },
    }),
    getLinkedInAnalyticsSummary(userId, "90d").catch(() => null),
    readPlanSources(),
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
    linkedInAnalytics && linkedInAnalytics.kpis.impressions > 0
      ? `LinkedIn post analytics: impressions ${linkedInAnalytics.kpis.impressions}, reach ${linkedInAnalytics.kpis.membersReached}, engagement ${linkedInAnalytics.kpis.engagement}, engagement rate ${Math.round(linkedInAnalytics.kpis.engagementRate * 1000) / 10}%.`
      : "No LinkedIn post analytics are available yet.",
    planSources.length
      ? `Plan memory available: ${planSources.slice(0, 5).map((plan) => plan.title).join("; ")}.`
      : "No plan memory files were available.",
  ];
  const noveltySignals = {
    recentHooks: priorDrafts.map((draft) => draft.hook).filter(Boolean).slice(0, 8),
    recentTitles: priorDrafts.map((draft) => draft.title).filter(Boolean).slice(0, 8),
    recentPillars: priorDrafts.map((draft) => draft.contentPillar).filter(Boolean).slice(0, 8),
    recentScreenshotRoutes: priorDrafts.flatMap((draft) => screenshotRoutes(draft.selectedScreenshots)).slice(0, 12),
    avoidPhrases: [
      "future CMS",
      "operating system",
      "blank page",
      "agent content team",
      "the boundary matters",
    ],
  };

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
      linkedInAnalytics?.topPosts[0] ? `Top LinkedIn post signal: ${linkedInAnalytics.topPosts[0].pillar} with ${linkedInAnalytics.topPosts[0].impressions} impressions.` : "LinkedIn analytics will help future content agents compare pillars and hooks.",
      ...planSources.slice(0, 4).map((plan) => `Plan angle from ${plan.title}: ${plan.summary}`),
    ],
    doNotClaim: [
      "Do not claim LinkedIn job-search, saved-job, Apply Connect, or auto-apply API access.",
      "Do not name companies, recruiters, salaries, job URLs, email addresses, or specific application outcomes.",
      "Do not imply production customer traction, revenue, or external adoption unless a future approved source exists.",
    ],
    screenshotRecommendations: [
      { route: "/dashboard", reason: "Shows the command surface and aggregate workflow status." },
      { route: "/dashboard/search", reason: "Shows search operations, exception review, and active discovery work." },
      { route: "/dashboard/social", reason: "Shows social analytics that inform the content loop." },
      { route: "/dashboard/market", reason: "Shows market intelligence and strategic evidence." },
      { route: "/dashboard/pipeline", reason: "Shows pipeline health, blockers, and application state." },
      { route: "/dashboard/email-ops", reason: "Shows Jolene Email Operations and next-step intelligence." },
      { route: "/sources", reason: "Shows source coverage and provider boundaries." },
      { route: "/runs", reason: "Shows run history and the system documenting its own work." },
      { route: "/applications", reason: "Shows the application pipeline at a workflow level." },
      { route: "/applications/assistant", reason: "Shows Apply Sprint workflow controls and human gates." },
      { route: "/jobs", reason: "Shows review queues and search result triage." },
      { route: "/profiles", reason: "Shows targeting strategy and search memory." },
      { route: "/evidence", reason: "Shows evidence memory used by agents." },
      { route: "/resumes", reason: "Shows material generation and reusable career assets." },
      { route: "/needs-me", reason: "Shows human approval gates and unresolved decisions." },
      { route: "/agents", reason: "Shows agent activity and observability." },
      { route: "/settings", reason: "Shows configuration and learning controls." },
      { route: "/linkedin-content", reason: "Shows the emerging content operating system itself." },
    ],
    planSources,
    noveltySignals,
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
      ...planSources.map((plan) => ({ type: "plan", ref: plan.filename, label: `${plan.title}: ${plan.summary}` })),
      ...activeAdjustments.map((item) => ({ type: "skill_adjustment", ref: item.id, label: `${item.skillId}: ${item.rationale.slice(0, 120)}` })),
      ...priorDrafts.map((draft) => ({ type: "linkedin_draft", ref: draft.id, label: `${draft.status}: ${draft.title}` })),
    ].slice(0, 24),
    analyticsSources: [
      ...recentSearchRuns.map((run) => ({ type: "search_run", ref: run.id, label: `${run.status}: fetched ${run.jobsFetched}, saved ${run.jobsSaved}` })),
      { type: "application_counts", ref: userId, label: formatCounts(applicationStatusCounts) || "No application counts" },
      { type: "outcome_counts", ref: userId, label: formatCounts(outcomeCounts) || "No outcome counts" },
      ...(linkedInAnalytics ? [{ type: "linkedin_post_analytics", ref: userId, label: `90d impressions ${linkedInAnalytics.kpis.impressions}, engagement ${linkedInAnalytics.kpis.engagement}` }] : []),
    ],
  };
}

async function readPlanSources() {
  try {
    const plansDir = path.join(process.cwd(), "plans");
    const files = (await fs.readdir(plansDir))
      .filter((file) => file.endsWith(".md"))
      .sort()
      .slice(-18);
    const plans = await Promise.all(files.map(async (filename) => {
      const content = await fs.readFile(path.join(plansDir, filename), "utf8");
      const title = firstHeading(content) ?? filename.replace(/\.md$/, "").replace(/[_-]+/g, " ");
      const summary = sectionText(content, "Summary") || firstParagraph(content) || "Plan context is available for content memory.";
      return {
        filename,
        title: sanitizePlanText(title, 110),
        summary: sanitizePlanText(summary, 220),
        themes: planThemes(content),
      };
    }));
    return plans.reverse();
  } catch {
    return [];
  }
}

function firstHeading(content: string) {
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
}

function firstParagraph(content: string) {
  return content
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s+/gm, "").trim())
    .find((part) => part.length > 40);
}

function sectionText(content: string, heading: string) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start === -1) return "";
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    body.push(line);
  }
  return body.join(" ").replace(/^[-*]\s+/gm, "").replace(/\s+/g, " ").trim();
}

function planThemes(content: string) {
  const normalized = content.toLowerCase();
  const themes = [
    ["jolene", "Jolene"],
    ["linkedin", "LinkedIn"],
    ["email", "Email Ops"],
    ["market", "Market intelligence"],
    ["workflow", "Workflow"],
    ["analytics", "Analytics"],
    ["screenshot", "Screenshots"],
    ["agent", "Agent systems"],
    ["calendar", "Calendar"],
  ].flatMap(([needle, label]) => normalized.includes(needle) ? [label] : []);
  return Array.from(new Set(themes)).slice(0, 5);
}

function sanitizePlanText(value: string, maxLength: number) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\$\s?\d[\d,]*(?:k|K)?\b/g, "[compensation]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function screenshotRoutes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const route = (item as Record<string, unknown>).route;
    return typeof route === "string" ? [route] : [];
  });
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
