import type { ApplicationOutcomeType, JobSearchProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import type { QualityProposalLearningRules } from "@/lib/skills/adjustments";

export type SearchProfileManagerInput = {
  userId?: string;
  learningRules?: QualityProposalLearningRules;
};

export type SearchProfileManagerOutput = {
  profileHealthScores: Array<{
    profileId: string;
    name: string;
    healthScore: number;
    rationale: string;
    performance: SearchProfilePerformanceSummary;
  }>;
  recommendedChanges: Array<{
    profileId: string;
    profileName: string;
    action: "edit" | "pause" | "merge" | "keep" | "review";
    summary: string;
  }>;
  profilesToMerge: Array<{
    profileIds: string[];
    names: string[];
    rationale: string;
  }>;
  profilesToPause: string[];
  profilesToCreate: Array<{
    name: string;
    targetTitles: string[];
    keywords: string[];
    rationale: string;
  }>;
  profilesToDelete: string[];
  rationale: string;
  confidence: number;
  appliedLearning?: string[];
};

export type SearchProfilePerformanceSummary = {
  jobsFound: number;
  jobsApproved: number;
  jobsRejected: number;
  applicationsSubmitted: number;
  recruiterScreens: number;
  interviews: number;
  offers: number;
  rejectionCount: number;
  noResponseCount: number;
  duplicateRate: number;
  averageFitScore: number;
  averageOpportunityScore: number;
  callbackRate: number;
};

type ProfileWithStats = JobSearchProfile & {
  matches: Array<{
    overallScore: number;
    status: string;
    jobPosting: {
      duplicateGroupId: string | null;
      evaluations: Array<{ fitScore: number; opportunityScore: number }>;
    };
    applications: Array<{
      status: string;
      outcomes: Array<{ outcome: ApplicationOutcomeType }>;
    }>;
  }>;
};

export async function runSearchProfileManagerAgent(input: SearchProfileManagerInput = {}) {
  return runAgent<SearchProfileManagerInput, SearchProfileManagerOutput>({
    agentType: "SEARCH_PROFILE_MANAGER",
    input,
    userId: input.userId,
    execute: async () => {
      const profiles = await prisma.jobSearchProfile.findMany({
        where: input.userId ? { userId: input.userId } : undefined,
        include: {
          matches: {
            include: {
              applications: {
                select: {
                  status: true,
                  outcomes: {
                    select: { outcome: true },
                    orderBy: { occurredAt: "desc" },
                    take: 1,
                  },
                },
              },
              jobPosting: {
                select: {
                  duplicateGroupId: true,
                  evaluations: {
                    select: { fitScore: true, opportunityScore: true },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          },
        },
        orderBy: [{ enabled: "desc" }, { name: "asc" }],
      });

      const profileHealthScores = profiles.map((profile) => scoreProfileHealth(profile));
      await persistPerformanceSnapshots(profileHealthScores);
      const overlaps = findOverlappingProfiles(profiles);
      const recommendedChanges = buildRecommendations(profiles, profileHealthScores, overlaps, input.learningRules);
      const profilesToPause = recommendedChanges.filter((change) => change.action === "pause").map((change) => change.profileId);
      const profilesToCreate = suggestProfilesToCreate(profiles);

      return {
        profileHealthScores,
        recommendedChanges,
        profilesToMerge: overlaps,
        profilesToPause,
        profilesToCreate,
        profilesToDelete: [],
        rationale: input.learningRules?.marketSearchAdaptation
          ? "Reviewed search profiles with accepted market-intelligence adaptation guidance. No destructive changes are applied automatically."
          : input.learningRules?.lowSavedYield
          ? "Reviewed search profiles with active low-yield learning, emphasizing source quality, query breadth, and profile specificity. No destructive changes are applied automatically."
          : "Reviewed search profiles using match volume, approval rate, rejection rate, average score, specificity, and title/keyword overlap. No destructive changes are applied automatically.",
        confidence: profiles.some((profile) => profile.matches.length >= 20) ? 0.82 : 0.62,
        appliedLearning: input.learningRules?.appliedCategories?.length ? input.learningRules.appliedCategories : undefined,
      };
    },
  });
}

function scoreProfileHealth(profile: ProfileWithStats) {
  const performance = calculatePerformanceSummary(profile);
  const total = performance.jobsFound;
  const averageScore = performance.averageFitScore;
  const approvalRate = total ? performance.jobsApproved / total : 0;
  const rejectionRate = total ? performance.jobsRejected / total : 0;
  const specificity = Math.min(20, (jsonArray(profile.titles).length + jsonArray(profile.keywordsPreferred).length + jsonArray(profile.keywordsRequired).length) * 2);
  const volumeScore = total === 0 ? 35 : total < 5 ? 50 : total <= 80 ? 76 : 58;
  const outcomeScore = Math.min(100, performance.callbackRate + performance.offers * 15);
  const healthScore = clamp(Math.round(volumeScore * 0.2 + averageScore * 0.25 + approvalRate * 100 * 0.18 + (100 - rejectionRate * 100) * 0.1 + specificity * 0.07 + outcomeScore * 0.2));

  return {
    profileId: profile.id,
    name: profile.name,
    healthScore,
    rationale: `${total} matches, ${performance.jobsApproved} approved, ${performance.jobsRejected} rejected, ${performance.applicationsSubmitted} applied, ${performance.callbackRate}% callback rate, average score ${averageScore || "n/a"}.`,
    performance,
  };
}

export function calculatePerformanceSummary(profile: ProfileWithStats): SearchProfilePerformanceSummary {
  const matches = profile.matches;
  const jobsFound = matches.length;
  const jobsApproved = matches.filter((match) => ["approved", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer"].includes(match.status)).length;
  const jobsRejected = matches.filter((match) => match.status === "rejected" || match.status === "rejected_by_company").length;
  const applications = matches.flatMap((match) => match.applications);
  const latestOutcomes = applications.map((application) => application.outcomes[0]?.outcome).filter(Boolean);
  const applicationsSubmitted = applications.filter((application) => isAppliedStatus(application.status) || application.outcomes.some((outcome) => outcome.outcome === "APPLIED")).length;
  const recruiterScreens = latestOutcomes.filter((outcome) => outcome === "RECRUITER_SCREEN").length;
  const interviews = latestOutcomes.filter((outcome) => outcome === "TECH_SCREEN" || outcome === "ONSITE" || outcome === "FINAL").length;
  const offers = latestOutcomes.filter((outcome) => outcome === "OFFER").length;
  const rejectionCount = latestOutcomes.filter((outcome) => outcome === "REJECTED" || outcome === "CLOSED").length;
  const noResponseCount = latestOutcomes.filter((outcome) => outcome === "GHOSTED").length;
  const duplicateCount = matches.filter((match) => Boolean(match.jobPosting.duplicateGroupId)).length;
  const fitScores = matches.map((match) => match.jobPosting.evaluations[0]?.fitScore ?? match.overallScore).filter((score) => score > 0);
  const opportunityScores = matches.map((match) => match.jobPosting.evaluations[0]?.opportunityScore ?? 0).filter((score) => score > 0);
  const positiveOutcomes = recruiterScreens + interviews + offers;

  return {
    jobsFound,
    jobsApproved,
    jobsRejected,
    applicationsSubmitted,
    recruiterScreens,
    interviews,
    offers,
    rejectionCount,
    noResponseCount,
    duplicateRate: jobsFound ? Math.round((duplicateCount / jobsFound) * 100) : 0,
    averageFitScore: average(fitScores),
    averageOpportunityScore: average(opportunityScores),
    callbackRate: applicationsSubmitted ? Math.round((positiveOutcomes / applicationsSubmitted) * 100) : 0,
  };
}

async function persistPerformanceSnapshots(profileHealthScores: SearchProfileManagerOutput["profileHealthScores"]) {
  if (!profileHealthScores.length) return;
  await prisma.searchProfilePerformance.createMany({
    data: profileHealthScores.map((profile) => {
      const performance = profile.performance;
      return {
        searchProfileId: profile.profileId,
        healthScore: profile.healthScore,
        lastEvaluatedAt: new Date(),
        jobsFound: performance.jobsFound,
        jobsApproved: performance.jobsApproved,
        jobsRejected: performance.jobsRejected,
        applicationsSubmitted: performance.applicationsSubmitted,
        recruiterScreens: performance.recruiterScreens,
        interviews: performance.interviews,
        offers: performance.offers,
        rejectionCount: performance.rejectionCount,
        noResponseCount: performance.noResponseCount,
        duplicateRate: performance.duplicateRate,
        averageFitScore: performance.averageFitScore,
        averageOpportunityScore: performance.averageOpportunityScore,
        callbackRate: performance.callbackRate,
      };
    }),
  });
}

export function buildRecommendations(
  profiles: ProfileWithStats[],
  health: SearchProfileManagerOutput["profileHealthScores"],
  overlaps: SearchProfileManagerOutput["profilesToMerge"],
  learningRules?: QualityProposalLearningRules,
) {
  const healthById = new Map(health.map((item) => [item.profileId, item]));
  const overlappingIds = new Set(overlaps.flatMap((overlap) => overlap.profileIds));

  return profiles.map((profile) => {
    const profileHealth = healthById.get(profile.id);
    const score = profileHealth?.healthScore ?? 0;
    const titles = jsonArray(profile.titles);
    const required = jsonArray(profile.keywordsRequired);
    const preferred = jsonArray(profile.keywordsPreferred);

    if (!profile.enabled) {
      return { profileId: profile.id, profileName: profile.name, action: "keep" as const, summary: "Profile is paused. Keep it out of scheduled search unless this positioning becomes active again." };
    }
    if (overlappingIds.has(profile.id)) {
      return { profileId: profile.id, profileName: profile.name, action: "merge" as const, summary: "This profile overlaps heavily with another profile. Review whether titles and keywords should be merged or narrowed." };
    }
    if (score < 45 && profile.matches.length >= 20) {
      return { profileId: profile.id, profileName: profile.name, action: "pause" as const, summary: "Low health with enough sample size. Pause or narrow this profile before another scheduled run." };
    }
    if (learningRules?.lowSavedYield && (profile.matches.length === 0 || score < 65)) {
      return { profileId: profile.id, profileName: profile.name, action: "review" as const, summary: "Active low-yield learning is enabled. Review query breadth, source quality, and profile specificity before the next search run." };
    }
    if (learningRules?.marketSearchAdaptation && score < 70) {
      return { profileId: profile.id, profileName: profile.name, action: "review" as const, summary: "Accepted market-intelligence guidance is active. Compare this profile against the latest market lane, skills, and company signals before the next search run." };
    }
    if (titles.length === 0 || required.length + preferred.length < 4) {
      return { profileId: profile.id, profileName: profile.name, action: "edit" as const, summary: "Profile is broad. Add target titles and high-signal keywords so job scoring has a clearer intent." };
    }
    return { profileId: profile.id, profileName: profile.name, action: "keep" as const, summary: "Profile is specific enough to keep running. Review outcomes after more applications are submitted." };
  });
}

function findOverlappingProfiles(profiles: JobSearchProfile[]): SearchProfileManagerOutput["profilesToMerge"] {
  const overlaps: SearchProfileManagerOutput["profilesToMerge"] = [];

  for (const [leftIndex, left] of profiles.entries()) {
    for (const right of profiles.slice(leftIndex + 1)) {
      const leftTerms = profileTerms(left);
      const rightTerms = profileTerms(right);
      const shared = leftTerms.filter((term) => rightTerms.includes(term));
      const smallerSize = Math.max(1, Math.min(leftTerms.length, rightTerms.length));
      const overlapRatio = shared.length / smallerSize;
      if (overlapRatio >= 0.65 && shared.length >= 4) {
        overlaps.push({
          profileIds: [left.id, right.id],
          names: [left.name, right.name],
          rationale: `High overlap across ${shared.slice(0, 6).join(", ")}.`,
        });
      }
    }
  }

  return overlaps;
}

function suggestProfilesToCreate(profiles: JobSearchProfile[]): SearchProfileManagerOutput["profilesToCreate"] {
  const allTerms = profiles.flatMap((profile) => profileTerms(profile));
  const hasSecurity = allTerms.some((term) => /security|identity|auth|webauthn|passkey/.test(term));
  const hasAi = allTerms.some((term) => /\bai\b|llm|agent|openai/.test(term));
  const suggestions: SearchProfileManagerOutput["profilesToCreate"] = [];

  if (!hasSecurity) {
    suggestions.push({
      name: "Security SaaS / Identity",
      targetTitles: ["Senior Frontend Engineer", "Senior Software Engineer, UI", "Full Stack Engineer"],
      keywords: ["security", "identity", "authentication", "webauthn", "passkeys", "admin console"],
      rationale: "Your evidence has authentication and security SaaS signals that deserve a dedicated campaign.",
    });
  }
  if (!hasAi) {
    suggestions.push({
      name: "AI Product Engineering",
      targetTitles: ["AI Product Engineer", "Senior Full Stack Engineer", "Product Engineer"],
      keywords: ["AI", "OpenAI", "agents", "structured outputs", "React", "TypeScript"],
      rationale: "AI tooling and product infrastructure are strong fit signals from current projects.",
    });
  }

  return suggestions;
}

function profileTerms(profile: JobSearchProfile) {
  return Array.from(new Set([
    ...jsonArray(profile.titles),
    ...jsonArray(profile.keywordsRequired),
    ...jsonArray(profile.keywordsPreferred),
    ...jsonArray(profile.industries),
  ].map((term) => term.toLowerCase().trim()).filter(Boolean)));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isAppliedStatus(status: string) {
  return ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"].includes(status);
}
