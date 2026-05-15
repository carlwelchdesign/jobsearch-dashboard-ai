import type { JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calculatePerformanceSummary } from "@/lib/agents/search-profile-manager";

describe("search profile performance", () => {
  it("summarizes jobs, applications, outcomes, duplicates, and scores", () => {
    const profile = {
      id: "profile",
      matches: [
        match("approved", 90, 88, null, []),
        match("applied", 84, 76, "dup_1", [{ status: "applied", outcomes: [{ outcome: "RECRUITER_SCREEN" }] }]),
        match("rejected", 62, 40, null, []),
        match("interviewing", 92, 91, null, [{ status: "interviewing", outcomes: [{ outcome: "TECH_SCREEN" }] }]),
      ],
    } as unknown as JobSearchProfile & Parameters<typeof calculatePerformanceSummary>[0];

    const summary = calculatePerformanceSummary(profile);

    expect(summary.jobsFound).toBe(4);
    expect(summary.jobsApproved).toBe(3);
    expect(summary.jobsRejected).toBe(1);
    expect(summary.applicationsSubmitted).toBe(2);
    expect(summary.recruiterScreens).toBe(1);
    expect(summary.interviews).toBe(1);
    expect(summary.duplicateRate).toBe(25);
    expect(summary.averageFitScore).toBe(82);
    expect(summary.averageOpportunityScore).toBe(74);
    expect(summary.callbackRate).toBe(100);
  });
});

function match(status: string, fitScore: number, opportunityScore: number, duplicateGroupId: string | null, applications: Array<{ status: string; outcomes: Array<{ outcome: string }> }>) {
  return {
    overallScore: fitScore,
    status,
    applications,
    jobPosting: {
      duplicateGroupId,
      evaluations: [{ fitScore, opportunityScore }],
    },
  };
}
