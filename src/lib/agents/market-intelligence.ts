import type { ApplicationOutcomeType, JobMatchStatus, JobPosting, JobSearchProfile, Prisma, SearchProfilePerformance } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type MarketIntelligenceInput = {
  userId?: string;
  lookbackDays?: number;
  researchDepth?: "standard" | "deep";
};

export type MarketIntelligenceOutput = {
  generatedAt: string;
  lookbackDays: number;
  summary: string;
  marketTemperature: Array<{
    lane: string;
    temperature: "hot" | "warm" | "mixed" | "cool";
    score: number;
    jobCount: number;
    applyNowCount: number;
    callbackRate: number;
    topCompanies: string[];
    rationale: string;
  }>;
  skillSignals: Array<{
    skill: string;
    status: "rising" | "stable" | "noisy";
    mentions: number;
    lanes: string[];
    guidance: string;
  }>;
  recommendedActions: Array<{
    priority: 1 | 2 | 3;
    category: "search_profile" | "positioning" | "company_targeting" | "outreach";
    title: string;
    detail: string;
    reviewOnly: true;
  }>;
  sourceDigest: Array<{
    title: string;
    publisher: string;
    url: string;
    status: "checked" | "unverified";
    signal: string;
  }>;
  researchDigest: ResearchArticleSummary[];
  researchSynthesis: {
    mode: "llm" | "deterministic";
    narrative: string;
    appObservedFacts: string[];
    sourceBackedClaims: string[];
    inferredRecommendations: string[];
    contradictions: string[];
    opportunities: string[];
    risks: string[];
    warnings: string[];
  };
  chartData: {
    laneDemand: Array<{ label: string; value: number }>;
    skillDemand: Array<{ label: string; value: number }>;
    profileHealth: Array<{ label: string; value: number }>;
  };
  dataFreshness: {
    internalJobsAnalyzed: number;
    applicationsAnalyzed: number;
    profilesAnalyzed: number;
    externalSourcesChecked: number;
  };
  confidence: number;
};

type SourceStatus = "checked" | "unverified";
type ResearchDepth = NonNullable<MarketIntelligenceInput["researchDepth"]>;

type MarketSource = {
  title: string;
  publisher: string;
  url: string;
  signal: string;
};

export type ResearchArticleSummary = {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  relevanceScore: number;
  confidence: number;
  excerpts: string[];
  claims: string[];
  implications: string[];
};

type ProfileForMarket = JobSearchProfile & {
  performanceSnapshots: SearchProfilePerformance[];
};

type MatchForMarket = {
  status: JobMatchStatus;
  overallScore: number;
  jobSearchProfileId: string;
  jobPosting: Pick<JobPosting, "id" | "company" | "title" | "description" | "requirements" | "niceToHaves" | "lastSeenAt"> & {
    evaluations: Array<{ recommendedAction: string; fitScore: number; opportunityScore: number }>;
    applications: Array<{
      status: JobMatchStatus;
      outcomes: Array<{ outcome: ApplicationOutcomeType }>;
    }>;
  };
};

type BuildInput = {
  profiles: ProfileForMarket[];
  matches: MatchForMarket[];
  candidateTerms: string[];
  sources: Array<MarketSource & { status: SourceStatus }>;
  researchDigest?: ResearchArticleSummary[];
  researchSynthesis?: MarketIntelligenceOutput["researchSynthesis"];
  lookbackDays: number;
  generatedAt?: Date;
};

type FetchedArticle = {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  text: string;
  excerpts: string[];
  relevanceScore: number;
};

const marketSources: MarketSource[] = [
  {
    title: "Software Developers, Quality Assurance Analysts, and Testers",
    publisher: "U.S. Bureau of Labor Statistics",
    url: "https://www.bls.gov/ooh/Computer-and-Information-Technology/Software-developers.htm",
    signal: "Baseline long-term outlook for software roles; use as context, not a weekly hiring signal.",
  },
  {
    title: "Indeed Hiring Lab",
    publisher: "Indeed Hiring Lab",
    url: "https://www.hiringlab.org/",
    signal: "Near-real-time posting and labor-market snapshots for tech and knowledge-work hiring.",
  },
  {
    title: "Four Takeaways from the 2026 Stanford AI Index",
    publisher: "Lightcast",
    url: "https://lightcast.io/resources/blog/stanford-ai-2026",
    signal: "AI-skill demand and posting shifts; useful for AI product, agentic workflow, and LLM-adjacent positioning.",
  },
  {
    title: "AI jobs on the rise, new LinkedIn report finds",
    publisher: "Axios",
    url: "https://www.axios.com/2025/01/07/ai-jobs-on-the-rise-linkedin-report",
    signal: "Role-title trend context for AI engineer and AI-adjacent product engineering demand.",
  },
];

const sourceIndexUrls = [
  "https://www.hiringlab.org/",
  "https://www.hiringlab.org/category/labor-market-update/",
  "https://lightcast.io/resources/blog",
  "https://www.bls.gov/ooh/Computer-and-Information-Technology/Software-developers.htm",
  "https://www.axios.com/technology/artificial-intelligence",
];

const researchRelevanceTerms = [
  "software developer",
  "software development",
  "frontend",
  "front-end",
  "react",
  "typescript",
  "ai",
  "artificial intelligence",
  "llm",
  "agentic",
  "agents",
  "developer tools",
  "design system",
  "tech hiring",
  "job postings",
  "labor market",
  "skills",
  "remote work",
];

const laneDefinitions = [
  {
    lane: "AI product/frontend",
    terms: ["ai", "llm", "agent", "rag", "workflow", "automation", "copilot", "machine learning"],
  },
  {
    lane: "Design systems/frontend platform",
    terms: ["design system", "component library", "storybook", "frontend platform", "ui platform", "accessibility"],
  },
  {
    lane: "Enterprise SaaS/product UI",
    terms: ["enterprise", "saas", "dashboard", "analytics", "workflow", "permissions", "admin", "reporting"],
  },
  {
    lane: "Developer tools/platform",
    terms: ["developer tools", "devtools", "platform", "api", "sdk", "infrastructure", "ci/cd", "observability"],
  },
  {
    lane: "Data-rich operations UI",
    terms: ["data", "visualization", "real-time", "operations", "finance", "risk", "marketplace", "intelligence"],
  },
];

const trackedSkills = [
  "React",
  "TypeScript",
  "Next.js",
  "Node.js",
  "AI",
  "LLM",
  "RAG",
  "Agents",
  "LangGraph",
  "MCP",
  "Design Systems",
  "Accessibility",
  "Analytics",
  "Workflow",
  "Observability",
  "Postgres",
];

export async function runMarketIntelligenceAgent(input: MarketIntelligenceInput = {}) {
  const lookbackDays = input.lookbackDays ?? 45;
  const researchDepth = input.researchDepth ?? "standard";
  return runAgent<MarketIntelligenceInput, MarketIntelligenceOutput>({
    agentType: "MARKET_INTELLIGENCE",
    input: { ...input, lookbackDays, researchDepth },
    userId: input.userId,
    execute: async () => {
      const since = new Date(Date.now() - lookbackDays * 86_400_000);
      const [profiles, matches, candidateProfile, sources, researchDigest] = await Promise.all([
        prisma.jobSearchProfile.findMany({
          where: input.userId ? { userId: input.userId } : undefined,
          include: { performanceSnapshots: { orderBy: { lastEvaluatedAt: "desc" }, take: 1 } },
          orderBy: [{ enabled: "desc" }, { name: "asc" }],
        }),
        prisma.jobProfileMatch.findMany({
          where: {
            createdAt: { gte: since },
            ...(input.userId ? { jobSearchProfile: { userId: input.userId } } : {}),
          },
          include: {
            jobPosting: {
              select: {
                id: true,
                company: true,
                title: true,
                description: true,
                requirements: true,
                niceToHaves: true,
                lastSeenAt: true,
                evaluations: {
                  select: { recommendedAction: true, fitScore: true, opportunityScore: true },
                  orderBy: { updatedAt: "desc" },
                  take: 1,
                },
                applications: {
                  select: {
                    status: true,
                    outcomes: {
                      select: { outcome: true },
                      orderBy: { occurredAt: "desc" },
                      take: 1,
                    },
                  },
                  take: 5,
                },
              },
            },
          },
          orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
          take: 500,
        }),
        prisma.userProfile.findFirst({
          where: input.userId ? { userId: input.userId } : undefined,
          include: {
            projects: true,
            workExperiences: true,
            experienceBullets: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        checkMarketSources(),
        collectMarketResearch({ depth: researchDepth }),
      ]);
      const draft = buildMarketIntelligenceReport({
        profiles,
        matches,
        candidateTerms: candidateTerms(candidateProfile),
        sources,
        researchDigest,
        lookbackDays,
      });
      const researchSynthesis = await synthesizeMarketResearch({
        draft,
        researchDigest,
        profiles: profiles.map((profile) => ({ name: profile.name, enabled: profile.enabled })),
      });

      return buildMarketIntelligenceReport({
        profiles,
        matches,
        candidateTerms: candidateTerms(candidateProfile),
        sources,
        researchDigest,
        researchSynthesis,
        lookbackDays,
      });
    },
  });
}

export function buildMarketIntelligenceReport(input: BuildInput): MarketIntelligenceOutput {
  const generatedAt = input.generatedAt ?? new Date();
  const laneStats = laneDefinitions
    .map((definition) => laneStat(definition, input.matches))
    .sort((left, right) => right.score - left.score || right.jobCount - left.jobCount || left.lane.localeCompare(right.lane));
  const skillSignals = buildSkillSignals(input.matches, input.candidateTerms);
  const recommendedActions = buildRecommendedActions(laneStats, skillSignals, input.profiles);
  const researchDigest = input.researchDigest ?? [];
  const researchSynthesis = input.researchSynthesis ?? deterministicResearchSynthesis({
    laneStats,
    skillSignals,
    researchDigest,
    warnings: researchDigest.length ? [] : ["No fresh article content was available; synthesis uses local pipeline signals and curated source metadata only."],
  });
  const topLane = laneStats[0];
  const summary = topLane
    ? `${topLane.lane} is the strongest current lane in your recent data with ${topLane.jobCount} matching role(s), ${topLane.applyNowCount} apply-now signal(s), and a ${topLane.callbackRate}% callback rate. Use external sources as context, but prioritize lanes that also show up in your own pipeline.`
    : "There is not enough recent local job data yet. Run discovery, then rerun market intelligence to compare market signals against your actual search pipeline.";

  return {
    generatedAt: generatedAt.toISOString(),
    lookbackDays: input.lookbackDays,
    summary,
    marketTemperature: laneStats,
    skillSignals,
    recommendedActions,
    sourceDigest: input.sources,
    researchDigest,
    researchSynthesis,
    chartData: {
      laneDemand: laneStats.map((lane) => ({ label: lane.lane, value: lane.jobCount })),
      skillDemand: skillSignals.slice(0, 8).map((skill) => ({ label: skill.skill, value: skill.mentions })),
      profileHealth: input.profiles.slice(0, 8).map((profile) => ({
        label: profile.name,
        value: profile.performanceSnapshots[0]?.healthScore ?? 0,
      })),
    },
    dataFreshness: {
      internalJobsAnalyzed: new Set(input.matches.map((match) => match.jobPosting.id)).size,
      applicationsAnalyzed: input.matches.reduce((count, match) => count + match.jobPosting.applications.length, 0),
      profilesAnalyzed: input.profiles.length,
      externalSourcesChecked: input.sources.filter((source) => source.status === "checked").length + researchDigest.length,
    },
    confidence: confidenceFor(input.matches.length, input.profiles.length, input.sources.filter((source) => source.status === "checked").length),
  };
}

export async function collectMarketResearch({
  depth = "standard",
  fetchImpl = fetch,
}: {
  depth?: ResearchDepth;
  fetchImpl?: typeof fetch;
} = {}): Promise<ResearchArticleSummary[]> {
  const maxArticles = marketIntelligenceMaxArticles(depth);
  const sourceUrls = unique([...sourceIndexUrls, ...extraSourceUrls()]);
  const discovered = new Map<string, string>();

  for (const sourceUrl of sourceUrls) {
    const page = await fetchText(sourceUrl, fetchImpl);
    if (!page) continue;
    for (const url of discoverArticleUrls(page.text, page.url)) {
      if (trustedResearchUrl(url) && !discovered.has(url)) discovered.set(url, sourceUrl);
      if (discovered.size >= maxArticles * 3) break;
    }
    if (trustedResearchUrl(page.url) && !discovered.has(page.url)) discovered.set(page.url, page.url);
  }

  const summaries: ResearchArticleSummary[] = [];
  for (const url of discovered.keys()) {
    const page = await fetchText(url, fetchImpl);
    if (!page) continue;
    const article = extractResearchArticle(page.text, page.url);
    if (!article || article.relevanceScore < 18) continue;
    summaries.push(summarizeArticleDeterministically(article));
    if (summaries.length >= maxArticles) break;
  }
  return summaries.sort((left, right) => right.relevanceScore - left.relevanceScore);
}

export function extractResearchArticle(html: string, url: string): FetchedArticle | null {
  const title = decodeHtml(metaContent(html, "og:title") || tagText(html, "title") || "Untitled market source").slice(0, 180);
  const publisher = decodeHtml(metaContent(html, "og:site_name") || hostFromUrl(url));
  const publishedAt = metaContent(html, "article:published_time") || metaContent(html, "date") || null;
  const text = readableText(html);
  if (text.length < 260 || /enable javascript|access denied|blocked|captcha/i.test(text.slice(0, 800))) return null;
  const relevanceScore = relevanceForText(`${title} ${text}`);
  const excerpts = relevantExcerpts(text, 4);
  return {
    title,
    publisher,
    url,
    publishedAt,
    text: text.slice(0, 12000),
    excerpts,
    relevanceScore,
  };
}

export function discoverArticleUrls(htmlOrXml: string, baseUrl: string) {
  const urls = new Set<string>();
  const hrefPattern = /href=["']([^"']+)["']/gi;
  const linkPattern = /<link>([^<]+)<\/link>/gi;
  for (const pattern of [hrefPattern, linkPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(htmlOrXml))) {
      const url = absoluteUrl(match[1], baseUrl);
      if (!url) continue;
      if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip)$/i.test(url)) continue;
      if (researchUrlLooksRelevant(url)) urls.add(url);
    }
  }
  return Array.from(urls);
}

function summarizeArticleDeterministically(article: FetchedArticle): ResearchArticleSummary {
  const claims = article.excerpts.slice(0, 3).map((excerpt) => sentenceSummary(excerpt));
  return {
    title: article.title,
    publisher: article.publisher,
    url: article.url,
    publishedAt: article.publishedAt,
    relevanceScore: article.relevanceScore,
    confidence: Math.min(0.86, Math.max(0.48, article.relevanceScore / 100)),
    excerpts: article.excerpts.map((excerpt) => excerpt.slice(0, 280)),
    claims,
    implications: claims.map((claim) => implicationForClaim(claim)),
  };
}

async function synthesizeMarketResearch({
  draft,
  researchDigest,
  profiles,
}: {
  draft: MarketIntelligenceOutput;
  researchDigest: ResearchArticleSummary[];
  profiles: Array<{ name: string; enabled: boolean }>;
}) {
  const fallback = deterministicResearchSynthesis({
    laneStats: draft.marketTemperature,
    skillSignals: draft.skillSignals,
    researchDigest,
    warnings: researchDigest.length ? [] : ["No fresh article content was fetched; use local data as the primary signal."],
  });
  if (!researchDigest.length) return fallback;
  const parsed = await parseStructuredOutput({
    schema: researchSynthesisSchema,
    schemaName: "market_research_synthesis",
    system: [
      "You are a practical job-market research analyst.",
      "Synthesize only from provided app metrics and article summaries.",
      "Separate app-observed facts, source-backed claims, and inferred recommendations.",
      "Do not invent citations or claim certainty beyond the inputs.",
      "Keep recommendations review-only and useful for a senior frontend/full-stack/AI product engineer.",
    ].join(" "),
    input: {
      marketTemperature: draft.marketTemperature,
      skillSignals: draft.skillSignals.slice(0, 10),
      profiles,
      articles: researchDigest,
    },
  }).catch(() => null);
  if (!parsed) return fallback;
  return {
    mode: "llm" as const,
    warnings: [],
    ...parsed,
  };
}

const researchSynthesisSchema = z.object({
  narrative: z.string(),
  appObservedFacts: z.array(z.string()).max(8),
  sourceBackedClaims: z.array(z.string()).max(8),
  inferredRecommendations: z.array(z.string()).max(8),
  contradictions: z.array(z.string()).max(6),
  opportunities: z.array(z.string()).max(6),
  risks: z.array(z.string()).max(6),
});

function deterministicResearchSynthesis({
  laneStats,
  skillSignals,
  researchDigest,
  warnings,
}: {
  laneStats: MarketIntelligenceOutput["marketTemperature"];
  skillSignals: MarketIntelligenceOutput["skillSignals"];
  researchDigest: ResearchArticleSummary[];
  warnings: string[];
}): MarketIntelligenceOutput["researchSynthesis"] {
  const topLane = laneStats[0];
  const topSkill = skillSignals[0];
  const topArticle = researchDigest[0];
  return {
    mode: "deterministic",
    narrative: topArticle
      ? `Recent source coverage and local pipeline data both point to focusing on ${topLane?.lane ?? "the strongest active lane"} while keeping ${topSkill?.skill ?? "high-signal skills"} visible in positioning.`
      : `Local pipeline data points to ${topLane?.lane ?? "the strongest active lane"}; fresh article content was not available for deeper synthesis.`,
    appObservedFacts: [
      topLane ? `${topLane.lane}: ${topLane.jobCount} recent matching roles and ${topLane.applyNowCount} strong apply signals.` : "No lane-level app facts are available yet.",
      topSkill ? `${topSkill.skill}: ${topSkill.mentions} mentions in recent matched jobs.` : "No skill mentions are available yet.",
    ],
    sourceBackedClaims: researchDigest.slice(0, 4).flatMap((article) => article.claims.slice(0, 1).map((claim) => `${claim} (${article.publisher})`)),
    inferredRecommendations: [
      topLane ? `Prioritize search profiles and outreach around ${topLane.lane}.` : "Run job discovery before relying on market recommendations.",
      topSkill ? `Make truthful ${topSkill.skill} evidence easier to find in materials and profile positioning.` : "Review profile evidence coverage before expanding keywords.",
    ],
    contradictions: [],
    opportunities: researchDigest.slice(0, 3).flatMap((article) => article.implications.slice(0, 1)),
    risks: warnings.length ? ["Research coverage was partial; do not over-weight the brief until fresh sources are available."] : [],
    warnings,
  };
}

async function checkMarketSources() {
  return Promise.all(marketSources.map(async (source) => ({
    ...source,
    status: await sourceReachable(source.url),
  })));
}

async function sourceReachable(url: string): Promise<SourceStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    return response.ok ? "checked" : "unverified";
  } catch {
    return "unverified";
  } finally {
    clearTimeout(timeout);
  }
}

function laneStat(definition: typeof laneDefinitions[number], matches: MatchForMarket[]): MarketIntelligenceOutput["marketTemperature"][number] {
  const laneMatches = matches.filter((match) => textHasAny(jobText(match.jobPosting), definition.terms));
  const applyNowCount = laneMatches.filter((match) => match.jobPosting.evaluations[0]?.recommendedAction === "APPLY_NOW" || match.overallScore >= 90).length;
  const applications = laneMatches.flatMap((match) => match.jobPosting.applications);
  const positiveOutcomes = applications.filter((application) => {
    const outcome = application.outcomes[0]?.outcome;
    return outcome === "RECRUITER_SCREEN" || outcome === "TECH_SCREEN" || outcome === "ONSITE" || outcome === "FINAL" || outcome === "OFFER";
  }).length;
  const callbackRate = applications.length ? Math.round((positiveOutcomes / applications.length) * 100) : 0;
  const companies = topValues(laneMatches.map((match) => match.jobPosting.company), 5);
  const score = clamp(Math.round(laneMatches.length * 6 + applyNowCount * 10 + callbackRate * 0.6));
  const temperature = score >= 75 ? "hot" : score >= 52 ? "warm" : laneMatches.length >= 3 ? "mixed" : "cool";

  return {
    lane: definition.lane,
    temperature,
    score,
    jobCount: laneMatches.length,
    applyNowCount,
    callbackRate,
    topCompanies: companies,
    rationale: `${laneMatches.length} recent matching role(s), ${applyNowCount} strong apply signal(s), ${applications.length} application(s), ${callbackRate}% callback rate.`,
  };
}

function buildSkillSignals(matches: MatchForMarket[], candidateTerms: string[]): MarketIntelligenceOutput["skillSignals"] {
  const candidateSet = new Set(candidateTerms.map(normalizeTerm));
  return trackedSkills
    .map((skill) => {
      const normalized = normalizeTerm(skill);
      const matchingLanes = new Set<string>();
      const mentions = matches.filter((match) => {
        const text = jobText(match.jobPosting);
        const hit = text.includes(normalized);
        if (hit) {
          for (const lane of laneDefinitions) {
            if (textHasAny(text, lane.terms)) matchingLanes.add(lane.lane);
          }
        }
        return hit;
      }).length;
      const status: MarketIntelligenceOutput["skillSignals"][number]["status"] = mentions >= 8 ? "rising" : mentions >= 3 ? "stable" : "noisy";
      const hasCandidateSignal = candidateSet.has(normalized);
      return {
        skill,
        status,
        mentions,
        lanes: Array.from(matchingLanes).slice(0, 4),
        guidance: hasCandidateSignal
          ? `${skill} appears in both your profile context and recent postings; keep it visible in positioning and evidence.`
          : `${skill} appears in recent postings but is not prominent in candidate evidence; only add it if truthful and supported.`,
      };
    })
    .filter((signal) => signal.mentions > 0)
    .sort((left, right) => right.mentions - left.mentions || left.skill.localeCompare(right.skill));
}

function buildRecommendedActions(
  lanes: MarketIntelligenceOutput["marketTemperature"],
  skills: MarketIntelligenceOutput["skillSignals"],
  profiles: ProfileForMarket[],
): MarketIntelligenceOutput["recommendedActions"] {
  const actions: MarketIntelligenceOutput["recommendedActions"] = [];
  const topLane = lanes[0];
  const topSkill = skills[0];
  const weakProfiles = profiles.filter((profile) => (profile.performanceSnapshots[0]?.healthScore ?? 100) < 60).slice(0, 2);

  if (topLane) {
    actions.push({
      priority: 1,
      category: "search_profile",
      title: `Prioritize ${topLane.lane}`,
      detail: `Recent data shows ${topLane.jobCount} matching role(s) and ${topLane.applyNowCount} strong apply signal(s). Review profile keywords and source companies for this lane.`,
      reviewOnly: true,
    });
  }
  if (topSkill) {
    actions.push({
      priority: 1,
      category: "positioning",
      title: `Make ${topSkill.skill} evidence easier to see`,
      detail: topSkill.guidance,
      reviewOnly: true,
    });
  }
  for (const profile of weakProfiles) {
    actions.push({
      priority: 2,
      category: "search_profile",
      title: `Review weak profile: ${profile.name}`,
      detail: `Latest health score is ${profile.performanceSnapshots[0]?.healthScore ?? 0}. Tighten noisy keywords, pause stale lanes, or split it into a clearer campaign.`,
      reviewOnly: true,
    });
  }
  if (topLane?.topCompanies.length) {
    actions.push({
      priority: 3,
      category: "outreach",
      title: "Pair applications with targeted outreach",
      detail: `Start with ${topLane.topCompanies.slice(0, 3).join(", ")} because they appear in the strongest current lane.`,
      reviewOnly: true,
    });
  }
  return actions.slice(0, 6);
}

function candidateTerms(profile: { projects?: Array<{ technologies: Prisma.JsonValue; highlights: Prisma.JsonValue }>; workExperiences?: Array<{ skills: Prisma.JsonValue; achievements: Prisma.JsonValue }>; experienceBullets?: Array<{ keywords: Prisma.JsonValue; text: string }> } | null) {
  if (!profile) return [];
  return unique([
    ...profile.projects?.flatMap((project) => [...jsonArray(project.technologies), ...jsonArray(project.highlights)]) ?? [],
    ...profile.workExperiences?.flatMap((experience) => [...jsonArray(experience.skills), ...jsonArray(experience.achievements)]) ?? [],
    ...profile.experienceBullets?.flatMap((bullet) => [...jsonArray(bullet.keywords), bullet.text]) ?? [],
  ]);
}

function jobText(job: Pick<JobPosting, "title" | "company" | "description" | "requirements" | "niceToHaves">) {
  return normalizeTerm([
    job.title,
    job.company,
    job.description,
    ...jsonArray(job.requirements),
    ...jsonArray(job.niceToHaves),
  ].join(" "));
}

function textHasAny(text: string, terms: string[]) {
  const normalized = normalizeTerm(text);
  return terms.some((term) => normalized.includes(normalizeTerm(term)));
}

function topValues(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function normalizeTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+#]+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function confidenceFor(matchCount: number, profileCount: number, checkedSources: number) {
  return Math.min(0.9, Math.max(0.45, 0.35 + Math.min(matchCount, 60) / 150 + Math.min(profileCount, 5) / 20 + checkedSources / 20));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<{ url: string; text: string; contentType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
        "User-Agent": "JobSearchOS-MarketIntelligence/1.0 (+local research assistant)",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|xml|rss|text\/plain/i.test(contentType)) return null;
    const text = (await response.text()).slice(0, 250_000);
    return { url: response.url || url, text, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readableText(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const articleMatch = /<article[\s\S]*?<\/article>/i.exec(withoutScripts);
  const body = articleMatch?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(withoutScripts)?.[0] ?? /<body[\s\S]*?<\/body>/i.exec(withoutScripts)?.[0] ?? withoutScripts;
  return decodeHtml(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function relevantExcerpts(text: string, limit: number) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 80);
  return sentences
    .map((sentence) => ({ sentence, score: relevanceForText(sentence) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.sentence);
}

function relevanceForText(value: string) {
  const normalized = normalizeTerm(value);
  let score = 0;
  for (const term of researchRelevanceTerms) {
    if (normalized.includes(normalizeTerm(term))) score += term.length > 8 ? 8 : 5;
  }
  if (/\b(2025|2026|latest|recent|monthly|weekly|trend|forecast|outlook)\b/i.test(value)) score += 10;
  if (/\b(job postings?|hiring|labor market|skills? demand|unemployment|salary|wage)\b/i.test(value)) score += 12;
  return clamp(score);
}

function researchUrlLooksRelevant(url: string) {
  return /hiring|labor|job|jobs|market|trend|ai|software|developer|skills|stanford|index|outlook|technology|workforce/i.test(url);
}

function trustedResearchUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const allowedHosts = [
      "bls.gov",
      "hiringlab.org",
      "lightcast.io",
      "axios.com",
      "linkedin.com",
      ...extraSourceUrls().map((item) => new URL(item).hostname.replace(/^www\./, "")).filter(Boolean),
    ];
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function extraSourceUrls() {
  return (process.env.MARKET_INTELLIGENCE_EXTRA_SOURCES ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function marketIntelligenceMaxArticles(depth: ResearchDepth) {
  const configured = Number(process.env.MARKET_INTELLIGENCE_MAX_ARTICLES);
  const base = Number.isFinite(configured) && configured > 0 ? configured : depth === "deep" ? 12 : 8;
  return Math.max(1, Math.min(20, Math.round(base)));
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return pattern.exec(html)?.[1]?.trim() ?? "";
}

function tagText(html: string, tag: string) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return pattern.exec(html)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(decodeHtml(value.trim()), baseUrl).toString().replace(/#.*$/, "");
  } catch {
    return null;
  }
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function sentenceSummary(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function implicationForClaim(claim: string) {
  const normalized = normalizeTerm(claim);
  if (normalized.includes("ai") || normalized.includes("agent") || normalized.includes("llm")) {
    return "Keep AI product, agentic workflow, and LLM-adjacent project evidence prominent when targeting senior frontend/product roles.";
  }
  if (normalized.includes("software") || normalized.includes("developer") || normalized.includes("hiring")) {
    return "Prioritize differentiated roles and targeted outreach because broad software hiring signals may be uneven.";
  }
  if (normalized.includes("skill")) {
    return "Treat skill signals as positioning guidance, but only add supported skills to profiles and materials.";
  }
  return "Use this source as context for weekly search prioritization rather than as an automatic profile change.";
}
