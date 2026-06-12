import type { JobSearchProfile, Prisma, SearchProfilePerformance } from "@prisma/client";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type MarketSearchAdaptation = {
  action: "add_preferred_keywords" | "add_preferred_companies" | "strengthen_profile" | "create_profile" | "review_profile";
  riskLevel: "LOW" | "HIGH";
  targetProfileId?: string;
  targetProfileName?: string;
  values: string[];
  rationale: string;
  confidence: number;
  autoApply: boolean;
  status: "candidate" | "applied" | "review_only" | "skipped" | "failed";
  reason?: string;
  proposalId?: string;
};

export type MarketAdaptationSummary = {
  applied: number;
  reviewOnly: number;
  skipped: number;
};

type MarketProfile = Pick<JobSearchProfile, "id" | "name" | "enabled" | "titles" | "keywordsPreferred" | "preferredCompanies"> & {
  performanceSnapshots?: SearchProfilePerformance[];
};

const maxKeywordAddsPerRun = 5;
const maxCompanyAddsPerRun = 10;

export async function applyMarketSearchAdaptations(input: {
  userId?: string | null;
  agentRunId: string;
  report: MarketIntelligenceOutput;
  profiles?: MarketProfile[];
}) {
  try {
    const profiles = input.profiles ?? await prisma.jobSearchProfile.findMany({
      where: {
        enabled: true,
        ...(input.userId ? { userId: input.userId } : {}),
      },
      include: { performanceSnapshots: { orderBy: { lastEvaluatedAt: "desc" }, take: 1 } },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    });
    const candidates = buildMarketSearchAdaptations(input.report, profiles);
    const applied = input.userId
      ? await applyCandidates({ ...input, profiles, candidates })
      : candidates.map((candidate) => ({ ...candidate, status: "skipped" as const, reason: "No user was available for guarded search adaptation." }));

    return {
      searchAdaptations: applied,
      adaptationSummary: summarizeAdaptations(applied),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market adaptation failure";
    const failed: MarketSearchAdaptation = {
      action: "strengthen_profile",
      riskLevel: "LOW",
      values: [],
      rationale: "Market search adaptation failed after the report was generated.",
      confidence: 0,
      autoApply: false,
      status: "failed",
      reason: message,
    };
    return {
      searchAdaptations: [failed],
      adaptationSummary: summarizeAdaptations([failed]),
    };
  }
}

export function buildMarketSearchAdaptations(report: MarketIntelligenceOutput, profiles: MarketProfile[]): MarketSearchAdaptation[] {
  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  const topLane = report.marketTemperature[0] ?? null;
  const targetProfile = topLane ? bestProfileForLane(topLane.lane, enabledProfiles) : enabledProfiles[0] ?? null;
  const topKeywords = report.skillSignals
    .filter((skill) => skill.status === "rising" || skill.status === "stable")
    .slice(0, maxKeywordAddsPerRun)
    .map((skill) => skill.skill);
  const adaptations: MarketSearchAdaptation[] = [];

  if (targetProfile && topKeywords.length) {
    adaptations.push({
      action: "add_preferred_keywords",
      riskLevel: "LOW",
      targetProfileId: targetProfile.id,
      targetProfileName: targetProfile.name,
      values: topKeywords,
      rationale: `Market intelligence found repeat demand for ${topKeywords.join(", ")} in the strongest recent lane.`,
      confidence: report.confidence,
      autoApply: true,
      status: "candidate",
    });
  }

  if (targetProfile && topLane?.topCompanies.length) {
    adaptations.push({
      action: "add_preferred_companies",
      riskLevel: "LOW",
      targetProfileId: targetProfile.id,
      targetProfileName: targetProfile.name,
      values: topLane.topCompanies.slice(0, maxCompanyAddsPerRun),
      rationale: `${topLane.topCompanies.slice(0, 3).join(", ")} appeared in the strongest current market lane.`,
      confidence: report.confidence,
      autoApply: true,
      status: "candidate",
    });
  }

  if (targetProfile && topLane) {
    adaptations.push({
      action: "strengthen_profile",
      riskLevel: "LOW",
      targetProfileId: targetProfile.id,
      targetProfileName: targetProfile.name,
      values: [topLane.lane],
      rationale: `${topLane.lane} is the strongest recent lane with ${topLane.jobCount} matching role(s) and ${topLane.applyNowCount} apply-now signal(s).`,
      confidence: report.confidence,
      autoApply: false,
      status: "review_only",
    });
  }

  if (topLane && !targetProfile) {
    adaptations.push({
      action: "create_profile",
      riskLevel: "HIGH",
      values: [topLane.lane, ...topKeywords.slice(0, 4)],
      rationale: `${topLane.lane} is strong, but no enabled search profile is available to receive additive signals.`,
      confidence: report.confidence,
      autoApply: false,
      status: "review_only",
    });
  }

  for (const profile of enabledProfiles.filter((profile) => (profile.performanceSnapshots?.[0]?.healthScore ?? 100) < 60).slice(0, 2)) {
    adaptations.push({
      action: "review_profile",
      riskLevel: "HIGH",
      targetProfileId: profile.id,
      targetProfileName: profile.name,
      values: [profile.name],
      rationale: `Latest profile health score is ${profile.performanceSnapshots?.[0]?.healthScore ?? 0}; review before narrowing, pausing, or splitting this campaign.`,
      confidence: Math.min(report.confidence, 0.72),
      autoApply: false,
      status: "review_only",
    });
  }

  return adaptations;
}

async function applyCandidates(input: {
  userId?: string | null;
  agentRunId: string;
  report: MarketIntelligenceOutput;
  profiles: MarketProfile[];
  candidates: MarketSearchAdaptation[];
}) {
  let keywordAdds = 0;
  let companyAdds = 0;
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const results: MarketSearchAdaptation[] = [];

  for (const candidate of input.candidates) {
    if (!candidate.autoApply || candidate.riskLevel !== "LOW") {
      const proposalId = await ensureReviewProposal(input.userId, input.agentRunId, candidate);
      results.push({ ...candidate, status: "review_only", proposalId });
      continue;
    }

    const profile = candidate.targetProfileId ? profileById.get(candidate.targetProfileId) : null;
    if (!profile) {
      results.push({ ...candidate, status: "skipped", reason: "Target search profile was not found." });
      continue;
    }

    if (candidate.action === "add_preferred_keywords") {
      const existing = jsonArray(profile.keywordsPreferred);
      const values = unique(candidate.values).filter((value) => !includesNormalized(existing, value)).slice(0, Math.max(0, maxKeywordAddsPerRun - keywordAdds));
      if (!values.length) {
        results.push({ ...candidate, values: [], status: "skipped", reason: "Preferred keyword additions were already present or capped." });
        continue;
      }
      keywordAdds += values.length;
      await prisma.jobSearchProfile.update({
        where: { id: profile.id },
        data: { keywordsPreferred: [...existing, ...values] as Prisma.InputJsonValue },
      });
      profile.keywordsPreferred = [...existing, ...values] as Prisma.JsonValue;
      results.push({ ...candidate, values, status: "applied" });
      continue;
    }

    if (candidate.action === "add_preferred_companies") {
      const existing = jsonArray(profile.preferredCompanies);
      const values = unique(candidate.values).filter((value) => !includesNormalized(existing, value)).slice(0, Math.max(0, maxCompanyAddsPerRun - companyAdds));
      if (!values.length) {
        results.push({ ...candidate, values: [], status: "skipped", reason: "Preferred company additions were already present or capped." });
        continue;
      }
      companyAdds += values.length;
      await prisma.jobSearchProfile.update({
        where: { id: profile.id },
        data: { preferredCompanies: [...existing, ...values] as Prisma.InputJsonValue },
      });
      profile.preferredCompanies = [...existing, ...values] as Prisma.JsonValue;
      results.push({ ...candidate, values, status: "applied" });
      continue;
    }

    const proposalId = await ensureReviewProposal(input.userId, input.agentRunId, candidate);
    results.push({ ...candidate, status: "review_only", proposalId });
  }

  return results;
}

async function ensureReviewProposal(userId: string | null | undefined, agentRunId: string, adaptation: MarketSearchAdaptation) {
  if (!userId) return undefined;
  const key = marketAdaptationKey(adaptation);
  const existing = await prisma.agentImprovementProposal.findFirst({
    where: {
      userId,
      target: "JOB_SEARCH",
      status: "PROPOSED",
      metadataJson: { path: ["marketAdaptationKey"], equals: key },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.id;

  const created = await prisma.agentImprovementProposal.create({
    data: {
      userId,
      target: "JOB_SEARCH",
      type: "SKILL",
      riskLevel: adaptation.riskLevel,
      title: titleForAdaptation(adaptation),
      summary: adaptation.rationale,
      rationale: adaptation.rationale,
      patchJson: {
        category: "market_search_adaptation",
        action: adaptation.action,
        values: adaptation.values,
        targetProfileId: adaptation.targetProfileId ?? null,
      } as Prisma.InputJsonValue,
      metadataJson: {
        source: "market_intelligence",
        failureCategory: "market_search_adaptation",
        marketRunId: agentRunId,
        marketAdaptationKey: key,
        targetProfileName: adaptation.targetProfileName ?? null,
        confidence: adaptation.confidence,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return created.id;
}

function summarizeAdaptations(adaptations: MarketSearchAdaptation[]): MarketAdaptationSummary {
  return {
    applied: adaptations.filter((adaptation) => adaptation.status === "applied").length,
    reviewOnly: adaptations.filter((adaptation) => adaptation.status === "review_only").length,
    skipped: adaptations.filter((adaptation) => adaptation.status === "skipped" || adaptation.status === "failed").length,
  };
}

function bestProfileForLane(lane: string, profiles: MarketProfile[]) {
  if (!profiles.length) return null;
  const laneTerms = normalizeList([lane, ...lane.split(/[ /]+/)]);
  return profiles
    .map((profile) => ({ profile, score: overlapScore(laneTerms, profileTerms(profile)) }))
    .sort((left, right) => right.score - left.score || left.profile.name.localeCompare(right.profile.name))[0]?.profile ?? null;
}

function profileTerms(profile: MarketProfile) {
  return normalizeList([profile.name, ...jsonArray(profile.titles), ...jsonArray(profile.keywordsPreferred)]);
}

function overlapScore(left: string[], right: string[]) {
  return left.reduce((score, term) => score + (right.some((candidate) => candidate.includes(term) || term.includes(candidate)) ? 1 : 0), 0);
}

function normalizeList(values: string[]) {
  return values.map(normalize).filter((value) => value.length >= 2);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+#]+/g, " ").trim();
}

function includesNormalized(values: string[], value: string) {
  const normalized = normalize(value);
  return values.some((existing) => normalize(existing) === normalized);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalize(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function marketAdaptationKey(adaptation: MarketSearchAdaptation) {
  return [adaptation.action, adaptation.targetProfileId ?? "new", ...adaptation.values.map(normalize)].join(":");
}

function titleForAdaptation(adaptation: MarketSearchAdaptation) {
  if (adaptation.action === "create_profile") return "Review market-suggested search profile";
  if (adaptation.action === "review_profile") return `Review market signal for ${adaptation.targetProfileName ?? "search profile"}`;
  if (adaptation.action === "strengthen_profile") return `Strengthen ${adaptation.targetProfileName ?? "search profile"} from market analysis`;
  if (adaptation.action === "add_preferred_keywords") return `Add market keywords to ${adaptation.targetProfileName ?? "search profile"}`;
  return `Add market companies to ${adaptation.targetProfileName ?? "search profile"}`;
}
