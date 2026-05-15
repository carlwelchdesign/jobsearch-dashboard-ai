import type { JobSearchProfile, SearchProfilePerformance } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSearchExpansion } from "@/lib/agents/search-expansion";
import type { CompanySource } from "@/lib/job-search/company-sources";

const companies: CompanySource[] = [
  {
    name: "Yubico",
    categories: ["security", "identity"],
    priority: 1,
    searchTerms: ["Senior Frontend Engineer", "React", "TypeScript", "WebAuthn"],
    careersQuery: "Yubico careers frontend React TypeScript",
  },
  {
    name: "Anduril",
    categories: ["defense-tech", "data-visualization"],
    priority: 1,
    searchTerms: ["Mission Software Engineer", "React", "TypeScript"],
    careersQuery: "Anduril careers mission software React TypeScript",
  },
  {
    name: "Figma",
    categories: ["design-systems", "developer-tools"],
    priority: 1,
    searchTerms: ["Design Systems Engineer", "React", "TypeScript"],
    careersQuery: "Figma careers design systems React TypeScript",
  },
  {
    name: "Ramp",
    categories: ["enterprise-saas", "fintech"],
    priority: 2,
    searchTerms: ["Senior Frontend Engineer", "Admin Console"],
    careersQuery: "Ramp careers senior frontend admin console",
  },
];

describe("search expansion agent", () => {
  it("suggests focused campaigns for uncovered company-source categories", () => {
    const output = buildSearchExpansion({
      profiles: [
        profile({
          id: "profile_ai",
          name: "AI Product",
          titles: ["AI Product Engineer"],
          keywordsPreferred: ["React", "TypeScript", "AI Tools"],
          industries: ["ai"],
        }),
      ],
      companySource: { enabled: true },
      companies,
    });

    expect(output.categoryCoverage.find((coverage) => coverage.category === "security")?.status).toBe("gap");
    expect(output.profilesToCreate.some((profile) => profile.name === "Security SaaS / Identity")).toBe(true);
    expect(output.profilesToCreate.some((profile) => profile.name === "Defense / Mission Software UI")).toBe(true);
    expect(output.rationale).toContain("Recommendations are suggestions only");
  });

  it("recommends careful expansion for a covered low-volume profile", () => {
    const output = buildSearchExpansion({
      profiles: [
        profile({
          id: "profile_security",
          name: "Security SaaS",
          titles: ["Senior Frontend Engineer"],
          keywordsPreferred: ["Authentication", "React"],
          industries: ["security"],
          performanceSnapshots: [performance({ jobsFound: 8, averageOpportunityScore: 74 })],
        }),
      ],
      companySource: { enabled: true },
      companies,
    });

    const expansion = output.profilesToExpand.find((item) => item.profileId === "profile_security");
    expect(expansion?.suggestedKeywords).toContain("TypeScript");
    expect(expansion?.suggestedCompanies).toContain("Yubico");
  });
});

function profile({
  id,
  name,
  titles = [],
  keywordsPreferred = [],
  industries = [],
  performanceSnapshots = [],
}: {
  id: string;
  name: string;
  titles?: string[];
  keywordsPreferred?: string[];
  industries?: string[];
  performanceSnapshots?: SearchProfilePerformance[];
}): JobSearchProfile & { performanceSnapshots: SearchProfilePerformance[] } {
  return {
    id,
    userId: "user_1",
    name,
    enabled: true,
    searchIntent: "custom",
    titles,
    excludedTitles: [],
    jobTypes: [],
    countries: [],
    regions: [],
    cities: [],
    remotePreference: "any",
    relocationPreference: "unknown",
    salaryCurrency: "USD",
    salaryMin: null,
    salaryMax: null,
    includeUnknownSalary: true,
    industries,
    preferredCompanies: [],
    excludedCompanies: [],
    keywordsRequired: [],
    keywordsPreferred,
    keywordsExcluded: [],
    minimumMatchScore: 75,
    maxResultsPerRun: 50,
    scheduleEnabled: true,
    cronExpression: null,
    emailDigestEnabled: true,
    pushNotificationsEnabled: false,
    minimumPushScore: 85,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    performanceSnapshots,
  };
}

function performance(overrides: Partial<SearchProfilePerformance>): SearchProfilePerformance {
  return {
    id: "perf_1",
    searchProfileId: "profile_security",
    jobsFound: 0,
    jobsApproved: 0,
    jobsRejected: 0,
    applicationsSubmitted: 0,
    recruiterScreens: 0,
    interviews: 0,
    offers: 0,
    rejectionCount: 0,
    noResponseCount: 0,
    duplicateRate: 0,
    averageFitScore: 0,
    averageOpportunityScore: 0,
    callbackRate: 0,
    healthScore: 0,
    lastEvaluatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
