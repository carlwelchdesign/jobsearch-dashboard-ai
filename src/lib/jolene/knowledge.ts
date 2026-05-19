import { prisma } from "@/lib/prisma";

export type JoleneKnowledgeSource =
  | "pipeline"
  | "applications"
  | "jobs"
  | "duplicates"
  | "search_profiles"
  | "search_runs"
  | "agent_runs"
  | "market_intelligence"
  | "outcomes"
  | "feedback"
  | "evidence"
  | "wiki";

export type JoleneKnowledgeItem = {
  type: JoleneKnowledgeSource;
  id: string;
  title: string;
  href?: string;
  excerpt: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export type JoleneGlobalContext = {
  checkedSources: JoleneKnowledgeSource[];
  pipeline: {
    jobsByStatus: Record<string, number>;
    applicationsByStatus: Record<string, number>;
    openBlockers: number;
    packetsNeedingReview: number;
    activeApplications: number;
    submittedApplications: number;
  };
  search: {
    enabledProfiles: number;
    disabledProfiles: number;
    scheduledProfiles: number;
    latestRun: {
      id: string;
      status: string;
      jobsFetched: number;
      jobsAfterDedupe: number;
      jobsSaved: number;
      errors: unknown;
      startedAt: string;
      finishedAt: string | null;
    } | null;
  };
  quality: {
    duplicateGroups: number;
    suppressions: number;
    recentAgentFailures: number;
    recentFeedback: number;
    outcomesByType: Record<string, number>;
  };
};

export type JoleneGroundedAnswer = {
  reply: string;
  actionJson: {
    action: "jolene_grounded_answer";
    checkedSources: JoleneKnowledgeSource[];
    retrievedItems: JoleneKnowledgeItem[];
    confidence: "low" | "medium" | "high";
    knownFacts: string[];
    likelyCauses: string[];
    recommendedActions: string[];
  };
};

export async function buildJoleneGlobalContext(userId: string): Promise<JoleneGlobalContext> {
  const [
    jobCounts,
    applicationCounts,
    openBlockers,
    packetsNeedingReview,
    profiles,
    latestRun,
    duplicateGroups,
    suppressions,
    recentAgentFailures,
    recentFeedback,
    outcomes,
  ] = await Promise.all([
    prisma.jobProfileMatch.groupBy({
      by: ["status"],
      where: { jobSearchProfile: { userId } },
      _count: { _all: true },
    }),
    prisma.application.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.agentUserRequest.count({ where: { userId, status: "OPEN" } }),
    prisma.applicationPacket.count({ where: { userId, status: { in: ["DRAFT", "NEEDS_REVIEW"] } } }),
    prisma.jobSearchProfile.findMany({
      where: { userId },
      select: { enabled: true, scheduleEnabled: true },
      take: 200,
    }),
    prisma.jobSearchRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.jobPosting.groupBy({
      by: ["duplicateGroupId"],
      where: { duplicateGroupId: { not: null } },
      _count: { _all: true },
    }),
    prisma.jobSuppression.count({ where: { userId } }),
    prisma.agentRun.count({ where: { userId, status: "FAILED" } }),
    prisma.skillFeedback.count({ where: { userId } }),
    prisma.applicationOutcome.groupBy({
      by: ["outcome"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const applicationsByStatus = countsByStatus(applicationCounts);

  return {
    checkedSources: [
      "pipeline",
      "applications",
      "jobs",
      "duplicates",
      "search_profiles",
      "search_runs",
      "agent_runs",
      "outcomes",
      "feedback",
    ],
    pipeline: {
      jobsByStatus: countsByStatus(jobCounts),
      applicationsByStatus,
      openBlockers,
      packetsNeedingReview,
      activeApplications: sumStatuses(applicationsByStatus, ["approved", "resume_generated", "cover_letter_generated", "ready_to_apply"]),
      submittedApplications: sumStatuses(applicationsByStatus, ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"]),
    },
    search: {
      enabledProfiles: profiles.filter((profile) => profile.enabled).length,
      disabledProfiles: profiles.filter((profile) => !profile.enabled).length,
      scheduledProfiles: profiles.filter((profile) => profile.scheduleEnabled).length,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            jobsFetched: latestRun.jobsFetched,
            jobsAfterDedupe: latestRun.jobsAfterDedupe,
            jobsSaved: latestRun.jobsSaved,
            errors: latestRun.errors,
            startedAt: latestRun.startedAt.toISOString(),
            finishedAt: latestRun.finishedAt ? latestRun.finishedAt.toISOString() : null,
          }
        : null,
    },
    quality: {
      duplicateGroups: duplicateGroups.filter((group) => group._count._all > 1).length,
      suppressions,
      recentAgentFailures,
      recentFeedback,
      outcomesByType: countsByOutcome(outcomes),
    },
  };
}

export async function retrieveJoleneKnowledge(query: string, userId: string): Promise<JoleneKnowledgeItem[]> {
  const [applications, jobs, profiles, agentRuns, evidence, outcomes, feedback] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, duplicateGroupId: true } },
        applicationPackets: { select: { id: true, status: true, qualityReviewJson: true, updatedAt: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.jobProfileMatch.findMany({
      where: { jobSearchProfile: { userId } },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, duplicateGroupId: true, staleScore: true } },
        jobSearchProfile: { select: { id: true, name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.jobSearchProfile.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        enabled: true,
        scheduleEnabled: true,
        minimumMatchScore: true,
        titles: true,
        keywordsRequired: true,
        keywordsPreferred: true,
        keywordsExcluded: true,
        countries: true,
        remotePreference: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.agentRun.findMany({
      where: { userId },
      select: { id: true, agentType: true, status: true, error: true, outputJson: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.candidateEvidence.findMany({
      where: { candidateProfile: { userId }, confidence: { not: "REJECTED" } },
      select: { id: true, title: true, content: true, confidence: true, tags: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.applicationOutcome.findMany({
      where: { userId },
      include: { jobPosting: { select: { id: true, company: true, title: true } } },
      orderBy: { occurredAt: "desc" },
      take: 60,
    }),
    prisma.skillFeedback.findMany({
      where: { userId },
      select: { id: true, skillId: true, problemSummary: true, expectedBehavior: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const candidates: JoleneKnowledgeItem[] = [
    ...applications.map((application) => ({
      type: "applications" as const,
      id: application.id,
      title: `${application.jobPosting.company} - ${application.jobPosting.title}`,
      href: `/applications/${application.id}`,
      excerpt: compact([
        `Application status ${application.status}.`,
        application.appliedAt ? `Applied ${application.appliedAt.toISOString()}.` : null,
        application.jobPosting.duplicateGroupId ? `Duplicate group ${application.jobPosting.duplicateGroupId}.` : null,
        application.applicationPackets?.[0] ? `Packet ${application.applicationPackets[0].status}.` : null,
      ]),
      confidence: 0.82,
      metadata: { status: application.status, jobId: application.jobPosting.id },
    })),
    ...jobs.map((match) => ({
      type: match.jobPosting.duplicateGroupId ? "duplicates" as const : "jobs" as const,
      id: match.id,
      title: `${match.jobPosting.company} - ${match.jobPosting.title}`,
      href: `/jobs/${match.jobPosting.id}`,
      excerpt: compact([
        `Match status ${match.status}; score ${match.overallScore}; profile ${match.jobSearchProfile.name}.`,
        `Recommended action: ${match.recommendedAction}.`,
        formatJsonList("Strong signals", match.strongestMatches),
        formatJsonList("Concerns", match.concerns),
        formatJsonList("Missing keywords", match.missingKeywords),
      ]),
      confidence: 0.78,
      metadata: { status: match.status, score: match.overallScore, profile: match.jobSearchProfile.name },
    })),
    ...profiles.map((profile) => ({
      type: "search_profiles" as const,
      id: profile.id,
      title: profile.name,
      href: "/profiles",
      excerpt: compact([
        `${profile.enabled ? "Enabled" : "Disabled"} profile; ${profile.scheduleEnabled ? "scheduled" : "not scheduled"}; minimum score ${profile.minimumMatchScore}.`,
        formatJsonList("Titles", profile.titles),
        formatJsonList("Required keywords", profile.keywordsRequired),
        formatJsonList("Preferred keywords", profile.keywordsPreferred),
        formatJsonList("Excluded keywords", profile.keywordsExcluded),
        formatJsonList("Countries", profile.countries),
        `Remote preference ${profile.remotePreference}.`,
      ]),
      confidence: 0.8,
    })),
    ...agentRuns.map((run) => ({
      type: run.agentType === "MARKET_INTELLIGENCE" ? "market_intelligence" as const : "agent_runs" as const,
      id: run.id,
      title: `${run.agentType} ${run.status}`,
      href: "/agents",
      excerpt: compact([
        `Agent run ${run.status}.`,
        run.error ? `Error: ${run.error}` : null,
        summarizeOutput(run.outputJson),
      ]),
      confidence: run.status === "FAILED" ? 0.86 : 0.62,
    })),
    ...evidence.map((item) => ({
      type: "evidence" as const,
      id: item.id,
      title: item.title,
      href: `/evidence?confidence=${item.confidence}`,
      excerpt: excerpt(item.content, 220),
      confidence: item.confidence === "VERIFIED" ? 0.86 : item.confidence === "INFERRED" ? 0.72 : 0.48,
      metadata: { tags: item.tags },
    })),
    ...outcomes.map((outcome) => ({
      type: "outcomes" as const,
      id: outcome.id,
      title: `${outcome.outcome} - ${outcome.jobPosting.company}`,
      href: `/applications/${outcome.applicationId}`,
      excerpt: compact([`${outcome.outcome} for ${outcome.jobPosting.title} at ${outcome.jobPosting.company}.`, outcome.notes]),
      confidence: 0.78,
    })),
    ...feedback.map((item) => ({
      type: "feedback" as const,
      id: item.id,
      title: `${item.skillId} feedback`,
      href: "/settings",
      excerpt: compact([item.problemSummary, item.expectedBehavior ? `Expected: ${item.expectedBehavior}` : null]),
      confidence: 0.68,
    })),
    ...wikiKnowledge(),
  ];

  return candidates
    .map((item) => ({ item, score: scoreKnowledge(query, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.confidence - a.item.confidence)
    .slice(0, 8)
    .map((entry) => ({ ...entry.item, confidence: Math.min(0.95, Math.max(entry.item.confidence, entry.score / 20)) }));
}

export function shouldUseJoleneGroundedAnswer(message: string) {
  const normalized = normalize(message);
  if (!/\b(why|what|where|how|which|diagnose|explain|improve|better|stuck|blocked|duplicates|duplicate|not finding|not getting)\b/.test(normalized)) {
    return false;
  }
  return /\b(jobs?|applications?|apply|pipeline|duplicates?|profiles?|search|outcomes?|interviews?|agents?|failures?|market|materials?|packets?|blockers?)\b/.test(normalized);
}

export function synthesizeJoleneGroundedAnswer({
  message,
  globalContext,
  retrievedItems,
}: {
  message: string;
  globalContext: JoleneGlobalContext;
  retrievedItems: JoleneKnowledgeItem[];
}): JoleneGroundedAnswer {
  const normalized = normalize(message);
  const checkedSources = Array.from(new Set([...globalContext.checkedSources, ...retrievedItems.map((item) => item.type)]));
  const facts = knownFacts(globalContext, retrievedItems);
  const causes = likelyCauses(normalized, globalContext, retrievedItems);
  const actions = recommendedActions(normalized, globalContext, retrievedItems);
  const confidence = answerConfidence(retrievedItems, facts, causes);

  const reply = [
    `I checked ${checkedSources.map(humanSource).join(", ")}.`,
    facts.length ? `Known facts: ${facts.join(" ")}` : "Known facts: I found app data, but not enough directly relevant evidence to make a strong diagnosis.",
    causes.length ? `Likely causes: ${causes.join(" ")}` : "Likely causes: the evidence is weak, so I would not assume a root cause yet.",
    actions.length ? `Next actions: ${actions.join(" ")}` : "Next actions: collect more evidence before changing settings or records.",
  ].join("\n\n");

  return {
    reply,
    actionJson: {
      action: "jolene_grounded_answer",
      checkedSources,
      retrievedItems,
      confidence,
      knownFacts: facts,
      likelyCauses: causes,
      recommendedActions: actions,
    },
  };
}

function knownFacts(globalContext: JoleneGlobalContext, retrievedItems: JoleneKnowledgeItem[]) {
  const facts = [
    `${globalContext.pipeline.openBlockers} open blocker(s), ${globalContext.pipeline.packetsNeedingReview} packet(s) needing review, ${globalContext.pipeline.activeApplications} active pre-submit application(s), and ${globalContext.pipeline.submittedApplications} submitted or outcome-bearing application(s).`,
    `${globalContext.search.enabledProfiles} enabled search profile(s), ${globalContext.search.disabledProfiles} disabled profile(s), and ${globalContext.search.scheduledProfiles} scheduled profile(s).`,
    globalContext.search.latestRun
      ? `Latest search run ${globalContext.search.latestRun.status}: ${globalContext.search.latestRun.jobsFetched} fetched, ${globalContext.search.latestRun.jobsAfterDedupe} after dedupe, ${globalContext.search.latestRun.jobsSaved} saved.`
      : "No search run is recorded.",
    `${globalContext.quality.duplicateGroups} duplicate group(s), ${globalContext.quality.suppressions} suppression rule(s), ${globalContext.quality.recentAgentFailures} failed agent run(s), and ${globalContext.quality.recentFeedback} Jolene/skill feedback item(s) are recorded.`,
  ];

  if (retrievedItems.length) {
    facts.push(`Most relevant records: ${retrievedItems.slice(0, 3).map((item) => `${item.title}${item.href ? ` (${item.href})` : ""}`).join("; ")}.`);
  }

  return facts;
}

function likelyCauses(normalized: string, globalContext: JoleneGlobalContext, retrievedItems: JoleneKnowledgeItem[]) {
  const causes: string[] = [];
  const profileItems = retrievedItems.filter((item) => item.type === "search_profiles");
  const duplicateItems = retrievedItems.filter((item) => item.type === "duplicates");
  const failedRuns = retrievedItems.filter((item) => item.type === "agent_runs" && item.title.includes("FAILED"));

  if (/\b(duplicate|duplicates|same|again|still showing|resurfacing)\b/.test(normalized)) {
    if (globalContext.quality.duplicateGroups > 0 || duplicateItems.length > 0) causes.push("Duplicate groups or related active records are present, so a submitted/rejected role can resurface through another job row.");
    if (globalContext.quality.suppressions === 0) causes.push("No suppression rules are recorded, so rejected or submitted canonical roles may not be blocked from future queues.");
  }
  if (/\b(not finding|not getting|better jobs|bad jobs|quality|fit|search)\b/.test(normalized)) {
    if (globalContext.search.enabledProfiles === 0) causes.push("No enabled search profile is available to drive discovery.");
    if (globalContext.search.latestRun && globalContext.search.latestRun.jobsSaved === 0) causes.push("The latest search run did not save jobs, which points to source, filter, or dedupe pressure.");
    if (profileItems.length) causes.push("Relevant search profiles should be reviewed for title, keyword, location, and minimum-score targeting.");
  }
  if (/\b(stuck|blocked|not moving|why.*apply|application)\b/.test(normalized)) {
    if (globalContext.pipeline.openBlockers > 0) causes.push("Open blocker questions can stop application or automation workflows.");
    if (globalContext.pipeline.packetsNeedingReview > 0) causes.push("Draft or needs-review packets can hold applications before submission.");
  }
  if (failedRuns.length || globalContext.quality.recentAgentFailures > 0) {
    causes.push("Recent agent failures may have left generated materials, scoring, search, or reconciliation incomplete.");
  }

  return causes.slice(0, 5);
}

function recommendedActions(normalized: string, globalContext: JoleneGlobalContext, retrievedItems: JoleneKnowledgeItem[]) {
  const actions: string[] = [];
  if (globalContext.pipeline.openBlockers > 0) actions.push("Open /needs-me and resolve the oldest blocker first.");
  if (/\b(duplicate|duplicates|same|again|still showing|resurfacing)\b/.test(normalized)) actions.push("Run duplicate detection, then review matching application and job links before marking anything applied or rejected.");
  if (/\b(not finding|not getting|better jobs|bad jobs|quality|fit|search)\b/.test(normalized)) {
    actions.push("Review /profiles for enabled profiles, minimum match scores, required keywords, excluded titles, countries, and remote preference.");
    actions.push("Refresh market intelligence from /profiles before broadening sources or lowering score thresholds.");
  }
  if (globalContext.search.latestRun?.status === "failed") actions.push("Open /agents or /dashboard and inspect the latest failed search run error before running another search.");
  if (retrievedItems.some((item) => item.href)) actions.push("Open the cited records above and make the smallest state change after verifying the exact job/application.");
  return Array.from(new Set(actions)).slice(0, 5);
}

function answerConfidence(retrievedItems: JoleneKnowledgeItem[], facts: string[], causes: string[]): "low" | "medium" | "high" {
  if (retrievedItems.length >= 3 && facts.length >= 3 && causes.length >= 2) return "high";
  if (retrievedItems.length >= 1 && facts.length >= 2) return "medium";
  return "low";
}

function wikiKnowledge(): JoleneKnowledgeItem[] {
  return [
    {
      type: "wiki",
      id: "job-discovery-and-scoring",
      title: "Job Discovery and Scoring",
      href: "/wiki/Job-Discovery-and-Scoring",
      excerpt: "Search profiles, sources, dedupe, scoring, match statuses, and recommended actions determine which jobs appear.",
      confidence: 0.58,
    },
    {
      type: "wiki",
      id: "evidence-rag-and-materials",
      title: "Evidence RAG and Materials",
      href: "/wiki/Evidence-RAG-and-Materials",
      excerpt: "Generated resumes, cover letters, packets, and coaching should be grounded in summarized candidate evidence.",
      confidence: 0.58,
    },
    {
      type: "wiki",
      id: "command-center-and-jolene",
      title: "Command Center and Jolene",
      href: "/wiki/Command-Center-and-Jolene",
      excerpt: "Jolene should inspect app state, blockers, runs, materials, and pipeline health before answering broad workflow questions.",
      confidence: 0.58,
    },
  ];
}

function scoreKnowledge(query: string, item: JoleneKnowledgeItem) {
  const terms = normalize(query).split(" ").filter((term) => term.length > 2 && !STOPWORDS.has(term));
  if (!terms.length) return 0;
  const haystack = normalize(`${item.type} ${item.title} ${item.excerpt} ${JSON.stringify(item.metadata ?? {})}`);
  let score = item.confidence * 2;
  for (const term of terms) {
    if (haystack.includes(term)) score += 2;
  }
  if (terms.some((term) => normalize(item.title).includes(term))) score += 4;
  return score;
}

function countsByStatus<T extends { status: string; _count: { _all: number } }>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});
}

function countsByOutcome<T extends { outcome: string; _count: { _all: number } }>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.outcome] = item._count._all;
    return acc;
  }, {});
}

function sumStatuses(counts: Record<string, number>, statuses: string[]) {
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

function compact(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function excerpt(value: string, maxLength: number) {
  const compactValue = value.replace(/\s+/g, " ").trim();
  return compactValue.length > maxLength ? `${compactValue.slice(0, maxLength).trim()}...` : compactValue;
}

function formatJsonList(label: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return `${label}: ${value.slice(0, 4).map((item) => String(item)).join(", ")}.`;
}

function summarizeOutput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const output = value as Record<string, unknown>;
  if (typeof output.summary === "string") return output.summary;
  if (Array.isArray(output.warnings) && output.warnings.length) return `Warnings: ${output.warnings.slice(0, 3).join(", ")}.`;
  if (Array.isArray(output.recommendedActions) && output.recommendedActions.length) return `Recommended actions: ${output.recommendedActions.slice(0, 3).map(String).join(", ")}.`;
  return null;
}

function humanSource(source: JoleneKnowledgeSource) {
  return source.replace(/_/g, " ");
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["the", "and", "or", "for", "from", "with", "about", "this", "that", "what", "why", "how", "are", "is", "not", "getting"]);
