import type { JobSearchProfile, JobSource, SearchProfilePerformance } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { defaultCompanySourceConfig, normalizeCompanySourceConfig } from "@/lib/job-search/company-source-config";
import type { CompanySource } from "@/lib/job-search/company-sources";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type SearchExpansionInput = {
  userId?: string;
};

export type SearchExpansionOutput = {
  categoryCoverage: Array<{
    category: string;
    sourceCompanyCount: number;
    coveredByProfiles: string[];
    priorityCompanies: string[];
    status: "covered" | "undercovered" | "gap";
  }>;
  profilesToCreate: Array<{
    name: string;
    rationale: string;
    targetTitles: string[];
    includedKeywords: string[];
    excludedKeywords: string[];
    industries: string[];
    exampleCompanies: string[];
    priority: 1 | 2 | 3;
  }>;
  profilesToExpand: Array<{
    profileId: string;
    profileName: string;
    suggestedKeywords: string[];
    suggestedCompanies: string[];
    rationale: string;
  }>;
  warnings: string[];
  rationale: string;
  confidence: number;
};

type ProfileWithPerformance = JobSearchProfile & {
  performanceSnapshots: SearchProfilePerformance[];
};

type CategoryStrategy = {
  name: string;
  aliases: string[];
  profileName: string;
  targetTitles: string[];
  keywords: string[];
  industries: string[];
};

const categoryStrategies: CategoryStrategy[] = [
  {
    name: "security",
    aliases: ["security", "identity"],
    profileName: "Security SaaS / Identity",
    targetTitles: ["Senior Frontend Engineer", "Senior Software Engineer, Frontend", "Full-Stack Product Engineer"],
    keywords: ["React", "TypeScript", "Authentication", "Identity", "WebAuthn", "Passkeys", "Admin Console"],
    industries: ["security", "identity", "enterprise-saas"],
  },
  {
    name: "ai",
    aliases: ["ai", "developer-tools"],
    profileName: "AI Product / Developer Tools",
    targetTitles: ["AI Product Engineer", "Senior Product Engineer", "Senior Full Stack Engineer"],
    keywords: ["React", "TypeScript", "Next.js", "AI Tools", "LLM", "Developer Experience", "Internal Tools"],
    industries: ["ai", "developer-tools"],
  },
  {
    name: "defense-tech",
    aliases: ["defense-tech", "geospatial", "data-visualization"],
    profileName: "Defense / Mission Software UI",
    targetTitles: ["Mission Software Engineer", "Senior Frontend Engineer", "Visualization Engineer"],
    keywords: ["React", "TypeScript", "Visualization", "Geospatial", "Operator Tools", "Dashboard"],
    industries: ["defense-tech", "geospatial", "data-visualization"],
  },
  {
    name: "design-systems",
    aliases: ["design-systems", "developer-tools"],
    profileName: "Design Systems / Frontend Platform",
    targetTitles: ["Design Systems Engineer", "Frontend Platform Engineer", "Staff Frontend Engineer"],
    keywords: ["React", "TypeScript", "Storybook", "Component Library", "Testing", "Frontend Platform"],
    industries: ["design-systems", "developer-tools"],
  },
  {
    name: "enterprise-saas",
    aliases: ["enterprise-saas", "fintech"],
    profileName: "Enterprise SaaS Product UI",
    targetTitles: ["Senior Frontend Engineer", "Senior Product Engineer", "Senior Full Stack Engineer"],
    keywords: ["React", "TypeScript", "Admin Console", "Workflow", "Dashboard", "Permissions", "Reporting"],
    industries: ["enterprise-saas", "fintech"],
  },
];
const genericCoverageTerms = new Set(["react", "typescript", "next.js", "nextjs", "senior", "frontend", "engineer"]);

export async function runSearchExpansionAgent(input: SearchExpansionInput = {}) {
  return runAgent<SearchExpansionInput, SearchExpansionOutput>({
    agentType: "SEARCH_EXPANSION",
    input,
    userId: input.userId,
    execute: async () => {
      const [profiles, companySource] = await Promise.all([
        prisma.jobSearchProfile.findMany({
          where: input.userId ? { userId: input.userId } : undefined,
          include: {
            performanceSnapshots: {
              orderBy: { lastEvaluatedAt: "desc" },
              take: 1,
            },
          },
          orderBy: [{ enabled: "desc" }, { name: "asc" }],
        }),
        prisma.jobSource.findUnique({
          where: { type_name: { type: "company_site", name: "Company Source List" } },
        }),
      ]);

      const sourceConfig = companySource ? normalizeCompanySourceConfig(companySource.config) : defaultCompanySourceConfig();
      return buildSearchExpansion({ profiles, companySource, companies: sourceConfig.companies });
    },
  });
}

export function buildSearchExpansion({
  profiles,
  companySource,
  companies,
}: {
  profiles: ProfileWithPerformance[];
  companySource?: Pick<JobSource, "enabled"> | null;
  companies: CompanySource[];
}): SearchExpansionOutput {
  const activeProfiles = profiles.filter((profile) => profile.enabled);
  const profileTermsById = new Map(activeProfiles.map((profile) => [profile.id, profileTerms(profile)]));
  const categoryCoverage = categoryStrategies.map((strategy) => coverageForStrategy(strategy, activeProfiles, profileTermsById, companies));
  const profilesToCreate = categoryCoverage
    .filter((coverage) => coverage.status !== "covered")
    .map((coverage) => profileForCoverage(coverage, companies))
    .filter((profile): profile is SearchExpansionOutput["profilesToCreate"][number] => Boolean(profile))
    .slice(0, 4);
  const profilesToExpand = activeProfiles
    .map((profile) => expansionForProfile(profile, profileTermsById.get(profile.id) ?? [], companies))
    .filter((item): item is SearchExpansionOutput["profilesToExpand"][number] => Boolean(item))
    .slice(0, 5);
  const warnings = buildWarnings({ profiles, companySource, companies, categoryCoverage });

  return {
    categoryCoverage,
    profilesToCreate,
    profilesToExpand,
    warnings,
    rationale: "Compared active search profiles against the curated company-source categories and latest profile performance snapshots. Recommendations are suggestions only and do not create, edit, or delete profiles.",
    confidence: companies.length >= 50 && activeProfiles.length >= 2 ? 0.72 : 0.56,
  };
}

function coverageForStrategy(
  strategy: CategoryStrategy,
  profiles: JobSearchProfile[],
  profileTermsById: Map<string, string[]>,
  companies: CompanySource[],
): SearchExpansionOutput["categoryCoverage"][number] {
  const sourceCompanies = companiesForStrategy(strategy, companies);
  const coveredByProfiles = profiles
    .filter((profile) => {
      const terms = profileTermsById.get(profile.id) ?? [];
      return strategy.aliases.some((alias) => terms.includes(alias)) || distinctKeywords(strategy).some((keyword) => terms.includes(normalizeTerm(keyword)));
    })
    .map((profile) => profile.name);
  const status = coveredByProfiles.length >= 2 ? "covered" : coveredByProfiles.length === 1 ? "undercovered" : "gap";

  return {
    category: strategy.name,
    sourceCompanyCount: sourceCompanies.length,
    coveredByProfiles,
    priorityCompanies: sourceCompanies.filter((company) => company.priority === 1).slice(0, 6).map((company) => company.name),
    status,
  };
}

function profileForCoverage(coverage: SearchExpansionOutput["categoryCoverage"][number], companies: CompanySource[]): SearchExpansionOutput["profilesToCreate"][number] | null {
  const strategy = categoryStrategies.find((item) => item.name === coverage.category);
  if (!strategy) return null;
  const exampleCompanies = companiesForStrategy(strategy, companies).filter((company) => company.priority <= 2).slice(0, 10).map((company) => company.name);
  return {
    name: strategy.profileName,
    rationale: coverage.status === "gap"
      ? `No active profile clearly targets ${coverage.category}; add a focused campaign before the company-source search runs broadly.`
      : `${coverage.category} is represented by one profile; add a narrower variant if the existing campaign is noisy or too general.`,
    targetTitles: strategy.targetTitles,
    includedKeywords: strategy.keywords,
    excludedKeywords: ["Junior", "New Grad", "Native mobile only", "Firmware only", "Sales Engineer only"],
    industries: strategy.industries,
    exampleCompanies,
    priority: coverage.status === "gap" ? 1 as const : 2 as const,
  };
}

function expansionForProfile(profile: ProfileWithPerformance, terms: string[], companies: CompanySource[]) {
  const matchingStrategies = categoryStrategies.filter((strategy) =>
    strategy.aliases.some((alias) => terms.includes(alias)) || distinctKeywords(strategy).some((keyword) => terms.includes(normalizeTerm(keyword))),
  );
  if (!matchingStrategies.length) return null;
  const latestPerformance = profile.performanceSnapshots[0];
  const needsExpansion = !latestPerformance || latestPerformance.jobsFound < 20 || latestPerformance.averageOpportunityScore >= 70;
  if (!needsExpansion) return null;

  const suggestedKeywords = unique(matchingStrategies.flatMap((strategy) => strategy.keywords).filter((keyword) => !terms.includes(normalizeTerm(keyword)))).slice(0, 8);
  const suggestedCompanies = unique(matchingStrategies.flatMap((strategy) => companiesForStrategy(strategy, companies).filter((company) => company.priority === 1).map((company) => company.name))).slice(0, 8);
  if (!suggestedKeywords.length && !suggestedCompanies.length) return null;

  return {
    profileId: profile.id,
    profileName: profile.name,
    suggestedKeywords,
    suggestedCompanies,
    rationale: latestPerformance
      ? `Latest snapshot has ${latestPerformance.jobsFound} jobs and ${latestPerformance.averageOpportunityScore}% average opportunity. Expand carefully with high-signal company-source terms.`
      : "No performance snapshot yet. Add high-signal company-source terms, then run a search and optimizer pass.",
  };
}

function companiesForStrategy(strategy: CategoryStrategy, companies: CompanySource[]) {
  return companies
    .filter((company) => company.categories.some((category) => strategy.aliases.includes(category)))
    .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
}

function distinctKeywords(strategy: CategoryStrategy) {
  return strategy.keywords.filter((keyword) => !genericCoverageTerms.has(normalizeTerm(keyword)));
}

function profileTerms(profile: JobSearchProfile) {
  return unique([
    profile.name,
    ...jsonArray(profile.titles),
    ...jsonArray(profile.industries),
    ...jsonArray(profile.keywordsRequired),
    ...jsonArray(profile.keywordsPreferred),
    ...jsonArray(profile.preferredCompanies),
  ].flatMap((term) => normalizeTerm(term).split(/\s+/)).filter(Boolean));
}

function buildWarnings({
  profiles,
  companySource,
  companies,
  categoryCoverage,
}: {
  profiles: ProfileWithPerformance[];
  companySource?: Pick<JobSource, "enabled"> | null;
  companies: CompanySource[];
  categoryCoverage: SearchExpansionOutput["categoryCoverage"];
}) {
  const warnings: string[] = [];
  if (!companySource) warnings.push("Company source settings were not found; defaults were used for this analysis.");
  if (companySource && !companySource.enabled) warnings.push("Company source search is disabled, so expansion suggestions will not affect discovery until it is enabled.");
  if (!profiles.some((profile) => profile.enabled)) warnings.push("No active search profiles found.");
  if (companies.length < 25) warnings.push("Company source list is small; expansion confidence is limited.");
  const gaps = categoryCoverage.filter((coverage) => coverage.status === "gap").map((coverage) => coverage.category);
  if (gaps.length) warnings.push(`Missing focused coverage for ${gaps.join(", ")}.`);
  return warnings;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+#]+/g, " ").trim();
}
