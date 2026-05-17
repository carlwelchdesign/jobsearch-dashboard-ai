import type { JobEvaluation, JobPosting, JobProfileMatch, JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildDailyCommandCenter } from "@/lib/agents/daily-command-center";

describe("buildDailyCommandCenter", () => {
  it("prioritizes ready applications before review and evidence work", () => {
    const now = new Date();
    const job = testJob("Example", "Senior Frontend Engineer");
    const match = testMatch(job, 91);
    const plan = buildDailyCommandCenter({
      needsReview: [match],
      approved: [testMatch(testJob("Other", "AI Product Engineer"), 86)],
      readyApplications: [{ id: "app_1", jobPosting: job, jobProfileMatch: match }],
      followUps: [],
      evidenceNeedsReview: 3,
      profileOptimizerRunCreatedAt: now,
      latestSearchRunStartedAt: now,
      applyNowEvaluations: [testEvaluation(job)],
      agencyCandidateCount: 0,
    });

    expect(plan.actions[0].category).toBe("submit_applications");
    expect(plan.actions.some((action) => action.category === "review_jobs")).toBe(true);
    expect(plan.actions.some((action) => action.category === "fix_evidence")).toBe(true);
  });
});

function testJob(company: string, title: string): JobPosting {
  const now = new Date();
  return {
    id: `${company}-${title}`,
    sourceId: null,
    sourceJobId: null,
    company,
    title,
    location: "Remote",
    country: null,
    city: null,
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    description: "React TypeScript",
    requirements: [],
    niceToHaves: [],
    benefits: [],
    applicationUrl: null,
    atsProvider: "unknown",
    rawData: {},
    contentHash: `${company}-${title}-hash`,
    duplicateGroupId: null,
    staleScore: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function testMatch(jobPosting: JobPosting, score: number): JobProfileMatch & { jobPosting: JobPosting; jobSearchProfile: Pick<JobSearchProfile, "name"> } {
  const now = new Date();
  return {
    id: `${jobPosting.id}-match`,
    jobPostingId: jobPosting.id,
    jobSearchProfileId: "profile",
    status: "needs_review",
    overallScore: score,
    titleFit: score,
    skillFit: score,
    seniorityFit: score,
    industryFit: score,
    compensationFit: score,
    remoteFit: score,
    relocationFit: score,
    strongestMatches: [],
    concerns: [],
    missingKeywords: [],
    recommendedAction: "Review",
    aiExplanation: "",
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    jobPosting,
    jobSearchProfile: { name: "Senior Frontend" },
  };
}

function testEvaluation(jobPosting: JobPosting): JobEvaluation & { jobPosting: JobPosting; jobSearchProfile: Pick<JobSearchProfile, "name"> } {
  const now = new Date();
  return {
    id: "evaluation",
    jobPostingId: jobPosting.id,
    jobSearchProfileId: "profile",
    fitScore: 90,
    opportunityScore: 82,
    confidenceScore: 77,
    recommendedAction: "APPLY_NOW",
    recommendedResumeProfile: "Senior Frontend",
    strengths: [],
    risks: [],
    missingKeywords: [],
    evidenceRefs: [],
    explanation: "Strong match.",
    createdAt: now,
    updatedAt: now,
    jobPosting,
    jobSearchProfile: { name: "Senior Frontend" },
  };
}
