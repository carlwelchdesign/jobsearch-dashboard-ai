import type { CandidateEvidence, JobPosting, JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildJobEvaluation } from "@/lib/agents/job-fit-scorer";

describe("buildJobEvaluation", () => {
  it("separates fit, opportunity, and confidence with evidence refs", () => {
    const evaluation = buildJobEvaluation({
      job: {
        title: "Senior Frontend Engineer, Identity",
        company: "Example Security",
        location: "Remote US",
        description: "Build React and TypeScript admin consoles for authentication, passkeys, WebAuthn, and security workflows.",
        salaryMin: 180000,
        salaryMax: 220000,
        remoteType: "remote",
        lastSeenAt: new Date(),
        source: { name: "Company ATS" },
      } as JobPosting & { source: { name: string } },
      profile: {
        name: "Security SaaS",
        titles: ["Senior Frontend Engineer"],
        keywordsRequired: ["React", "TypeScript"],
        keywordsPreferred: ["WebAuthn", "passkeys", "admin console"],
        keywordsExcluded: [],
        excludedCompanies: [],
        excludedTitles: [],
        industries: ["security", "identity"],
        includeUnknownSalary: false,
        minimumMatchScore: 75,
        remotePreference: "remote_us_only",
        relocationPreference: "unknown",
      } as unknown as JobSearchProfile,
      evidence: [
        {
          id: "ev_webauthn",
          title: "WebAuthn Core",
          content: "Reusable WebAuthn orchestration package for passkey registration and authentication.",
          tags: ["webauthn", "passkeys", "security", "typescript"],
        },
      ] as CandidateEvidence[],
    });

    expect(evaluation.fitScore).toBeGreaterThanOrEqual(75);
    expect(evaluation.opportunityScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.confidenceScore).toBeGreaterThan(40);
    expect(evaluation.evidenceRefs).toEqual(["ev_webauthn"]);
    expect(evaluation.recommendedResumeProfile).toContain("Security");
  });

  it("keeps low-evidence, thin descriptions in needs-review territory", () => {
    const evaluation = buildJobEvaluation({
      job: {
        title: "Software Engineer",
        company: "Unknown",
        location: null,
        description: "Build software.",
        salaryMin: null,
        salaryMax: null,
        remoteType: "unknown",
        lastSeenAt: new Date(Date.now() - 60 * 86_400_000),
        source: null,
      } as JobPosting & { source: null },
      profile: {
        name: "Senior Frontend",
        titles: ["Senior Frontend Engineer"],
        keywordsRequired: ["React", "TypeScript"],
        keywordsPreferred: [],
        keywordsExcluded: [],
        excludedCompanies: [],
        excludedTitles: [],
        industries: [],
        includeUnknownSalary: false,
        minimumMatchScore: 75,
        remotePreference: "remote_us_only",
        relocationPreference: "unknown",
      } as unknown as JobSearchProfile,
      evidence: [],
    });

    expect(evaluation.confidenceScore).toBeLessThan(45);
    expect(evaluation.recommendedAction).toBe("NEEDS_REVIEW");
    expect(evaluation.risks).toContain("No approved candidate evidence was retrieved for this role.");
  });
});
