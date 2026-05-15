import type { JobPosting, JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildCompensationOpportunity } from "@/lib/agents/compensation-opportunity";

describe("compensation opportunity agent", () => {
  it("recommends pursuing a fresh role that meets target compensation", () => {
    const output = buildCompensationOpportunity({
      applicationId: "app",
      job: {
        company: "SecurityCo",
        title: "Senior Frontend Engineer",
        location: "Remote US",
        remoteType: "remote",
        salaryMin: 190000,
        salaryMax: 230000,
        salaryCurrency: "USD",
        lastSeenAt: new Date(),
        description: "React TypeScript authentication WebAuthn dashboard work with strong frontend platform scope.",
        staleScore: 0,
      } as JobPosting,
      profile: {
        name: "Security SaaS",
        remotePreference: "remote_us_only",
        salaryMin: 175000,
        salaryMax: null,
        salaryCurrency: "USD",
        includeUnknownSalary: false,
        industries: ["security", "identity"],
        keywordsPreferred: ["WebAuthn", "dashboard"],
      } as unknown as JobSearchProfile,
    });

    expect(output.opportunityScore).toBeGreaterThanOrEqual(75);
    expect(output.recommendedAction).toBe("PURSUE");
    expect(output.risks).toEqual([]);
    expect(output.strategicValue).toEqual(expect.arrayContaining(["Security/identity positioning value."]));
  });

  it("flags missing salary and stale risk", () => {
    const output = buildCompensationOpportunity({
      applicationId: "app",
      job: {
        company: "UnknownCo",
        title: "Frontend Engineer",
        location: "Onsite",
        remoteType: "onsite",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        lastSeenAt: new Date("2025-01-01T00:00:00.000Z"),
        description: "Frontend role.",
        staleScore: 70,
      } as JobPosting,
      profile: {
        name: "Remote Senior Frontend",
        remotePreference: "remote_us_only",
        salaryMin: 175000,
        salaryMax: null,
        salaryCurrency: "USD",
        includeUnknownSalary: false,
        industries: [],
        keywordsPreferred: [],
      } as unknown as JobSearchProfile,
    });

    expect(output.risks).toEqual(expect.arrayContaining(["Salary range is missing.", "Stale score is 70."]));
    expect(output.recommendedAction).not.toBe("PURSUE");
    expect(output.negotiationPrep[0]).toContain("Ask for the approved compensation range");
  });
});
