import type { JobEvaluation, JobPosting, JobSource } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildCompanyResearch } from "@/lib/agents/company-research";

describe("company research agent", () => {
  it("builds a grounded company brief from saved job data", () => {
    const output = buildCompanyResearch({
      applicationId: "app",
      job: {
        company: "IdentityCo",
        title: "Senior Frontend Engineer",
        location: "Remote",
        remoteType: "remote",
        salaryMin: null,
        salaryMax: null,
        applicationUrl: "https://example.com/apply",
        atsProvider: "greenhouse",
        rawData: { companySource: true },
        description: "Build React TypeScript dashboards for authentication, passkeys, security admin workflows, and cross-functional product teams.",
        source: { name: "Company Source List", type: "company_site", config: {} } as JobSource,
        evaluations: [
          {
            strengths: ["React", "WebAuthn"],
            risks: ["Salary range is unknown."],
            missingKeywords: [],
            recommendedResumeProfile: "Security SaaS / Identity",
          } as unknown as JobEvaluation,
        ],
      } as unknown as JobPosting & { source: JobSource; evaluations: JobEvaluation[] },
    });

    expect(output.brief).toContain("IdentityCo");
    expect(output.roleThemes).toEqual(expect.arrayContaining(["React/frontend product UI", "security and identity workflows"]));
    expect(output.positioningAngles).toContain("Lead with the Security SaaS / Identity resume variant.");
    expect(output.sourceNotes).toContain("Found through the curated company source list.");
    expect(output.risks).toContain("Salary range is unknown.");
  });
});
