import type { ExperienceBullet, GithubRepository, Project, UserProfile, WorkExperience } from "@prisma/client";
import { z } from "zod";
import { parseStructuredOutput } from "@/lib/ai/openai";

export const profileSuggestionSchema = z.object({
  suggestions: z.array(z.object({
    name: z.string(),
    searchIntent: z.enum(["us_remote", "global_remote", "europe_relocation", "specific_country", "industry_specific", "custom"]).default("custom"),
    remotePreference: z.enum(["remote_us_only", "remote_global", "remote_europe", "hybrid", "onsite_relocation", "any"]).default("any"),
    relocationPreference: z.enum(["not_interested", "open_to_relocation", "requires_relocation_support", "visa_sponsorship_required", "eu_blue_card_possible", "unknown"]).default("unknown"),
    titles: z.array(z.string()).default([]),
    jobTypes: z.array(z.string()).default([]),
    countries: z.array(z.string()).default([]),
    salaryCurrency: z.enum(["USD", "EUR", "GBP", "SEK"]).default("USD"),
    salaryMin: z.number().int().nullable().default(null),
    industries: z.array(z.string()).default([]),
    keywordsRequired: z.array(z.string()).default([]),
    keywordsPreferred: z.array(z.string()).default([]),
    keywordsExcluded: z.array(z.string()).default([]),
    excludedCompanies: z.array(z.string()).default([]),
    minimumMatchScore: z.number().int().min(0).max(100).default(75),
    rationale: z.string(),
    evidence: z.array(z.string()).default([]),
    githubEvidence: z.array(z.string()).default([]),
  })).min(1).max(12),
});

export type ProfileSuggestion = z.infer<typeof profileSuggestionSchema>["suggestions"][number];

type SuggestInput = {
  userProfile: UserProfile;
  bullets: ExperienceBullet[];
  workExperiences: WorkExperience[];
  projects: Project[];
  githubRepositories: GithubRepository[];
  applicationHistory?: Array<{
    company: string;
    title: string;
    status: string;
    outcomes: string[];
    matchScore: number | null;
    receivedConfirmation: boolean;
  }>;
};

export async function suggestSearchProfiles(input: SuggestInput): Promise<ProfileSuggestion[]> {
  const fallback = fallbackSuggestions(input);

  try {
    const generated = await parseStructuredOutput({
      schema: profileSuggestionSchema,
      schemaName: "suggest_job_search_profiles",
      system:
        "Suggest job search profiles for a senior software engineer who may be overlooking adjacent opportunities. " +
        "Use only the supplied approved profile, verified work bullets, work history, projects, and GitHub repositories as evidence. " +
        "Also use application history and outcomes to avoid noisy lanes and emphasize search profiles with signs of employer response. " +
        "Include GitHub repositories as qualification signals when relevant, especially recent public work. " +
        "Do not suggest roles that require credentials, degrees, clear domain experience, or management scope that the evidence does not support. " +
        "Return practical search profiles with target titles, keywords, industries, remote preferences, thresholds, rationale, and evidence.",
      input: {
        candidateProfile: {
          fullName: input.userProfile.fullName,
          summary: input.userProfile.professionalSummary ?? input.userProfile.masterSummary,
          yearsExperience: input.userProfile.yearsExperience,
          primaryRoles: input.userProfile.primaryRoles,
          coreSkills: input.userProfile.coreSkills,
          technicalSkills: input.userProfile.technicalSkills,
          industries: input.userProfile.industries,
          domainExpertise: input.userProfile.domainExpertise,
        },
        verifiedBullets: input.bullets.map((bullet) => ({
          company: bullet.company,
          role: bullet.role,
          category: bullet.category,
          text: bullet.text,
          keywords: bullet.keywords,
        })),
        workExperience: input.workExperiences.map((work) => ({
          company: work.company,
          title: work.title,
          summary: work.summary,
          skills: work.skills,
          achievements: work.achievements,
        })),
        projects: input.projects.map((project) => ({
          name: project.name,
          description: project.description,
          technologies: project.technologies,
          highlights: project.highlights,
        })),
        githubRepositories: input.githubRepositories.map((repo) => ({
          name: repo.name,
          fullName: repo.fullName,
          url: repo.htmlUrl,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          stars: repo.stars,
          pushedAt: repo.pushedAt,
        })),
        applicationHistory: input.applicationHistory ?? [],
      },
    });

    if (generated?.suggestions?.length) return normalizeSuggestions(generated.suggestions);
  } catch (error) {
    console.warn("OpenAI profile suggestion failed; using deterministic fallback.", error);
  }

  return fallback;
}

function fallbackSuggestions({ userProfile, bullets, workExperiences, githubRepositories, applicationHistory = [] }: SuggestInput): ProfileSuggestion[] {
  const text = [
    userProfile.professionalSummary,
    userProfile.masterSummary,
    ...bullets.map((bullet) => bullet.text),
    ...workExperiences.map((work) => `${work.company} ${work.title} ${work.summary ?? ""}`),
    ...githubRepositories.map((repo) => `${repo.name} ${repo.description ?? ""} ${jsonStringArray(repo.topics).join(" ")} ${repo.language ?? ""}`),
    ...applicationHistory.map((application) => `${application.company} ${application.title} ${application.status} ${application.outcomes.join(" ")}`),
  ].join(" ").toLowerCase();
  const repos = githubRepositories.filter((repo) => !repo.isFork).slice(0, 8);
  const repoEvidence = repos.map((repo) => `${repo.name}${repo.description ? `: ${repo.description}` : ""}`).slice(0, 4);
  const baseExcluded = ["pay to apply", "application fee", "commission only", "unpaid", "equity only"];

  const suggestions: ProfileSuggestion[] = [
    {
      name: "Frontend Platform / Design Systems",
      searchIntent: "industry_specific",
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      titles: ["Staff Frontend Engineer", "Senior Frontend Platform Engineer", "Design Systems Engineer", "Frontend Infrastructure Engineer"],
      jobTypes: ["frontend", "staff", "developer_tools"],
      countries: ["United States"],
      salaryCurrency: "USD",
      salaryMin: 175000,
      industries: ["SaaS", "developer tools", "design systems", "platform"],
      keywordsRequired: [],
      keywordsPreferred: ["React", "TypeScript", "Storybook", "component library", "design system", "frontend architecture", "Material UI"],
      keywordsExcluded: baseExcluded,
      excludedCompanies: ["RemoteOK"],
      minimumMatchScore: 76,
      rationale: "Your profile has strong evidence for reusable frontend systems, component libraries, Storybook adoption, and enterprise UI architecture.",
      evidence: evidenceContaining(bullets, ["storybook", "component", "material ui", "frontend", "react", "typescript"]),
      githubEvidence: repoEvidence,
    },
    {
      name: "Security SaaS / Identity / Passkeys",
      searchIntent: "industry_specific",
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      titles: ["Staff Frontend Engineer", "Senior Frontend Engineer", "Frontend Platform Engineer", "Senior Full Stack Engineer"],
      jobTypes: ["frontend", "fullstack", "security", "staff"],
      countries: ["United States"],
      salaryCurrency: "USD",
      salaryMin: 175000,
      industries: ["security", "identity", "authentication", "access management", "SaaS"],
      keywordsRequired: [],
      keywordsPreferred: ["WebAuthn", "passkeys", "MFA", "authentication", "identity", "enterprise security", "admin console", "provisioning"],
      keywordsExcluded: baseExcluded,
      excludedCompanies: ["RemoteOK"],
      minimumMatchScore: 76,
      rationale: "Yubico experience plus identity/security product work makes security SaaS and authentication UI a strong lane.",
      evidence: evidenceContaining(bullets, ["webauthn", "passkeys", "mfa", "identity", "security", "provisioning", "yubico"]),
      githubEvidence: evidenceRepos(repos, ["webauthn", "auth", "security", "passkey"]),
    },
    {
      name: "AI Product / Structured Outputs",
      searchIntent: "industry_specific",
      remotePreference: "remote_global",
      relocationPreference: "unknown",
      titles: ["AI Product Engineer", "Senior Full Stack Engineer", "Senior Frontend Engineer, AI", "Developer Tools Engineer"],
      jobTypes: ["ai_product", "fullstack", "frontend", "developer_tools"],
      countries: [],
      salaryCurrency: "USD",
      salaryMin: 160000,
      industries: ["AI", "developer tools", "SaaS", "automation"],
      keywordsRequired: [],
      keywordsPreferred: ["OpenAI", "structured outputs", "LLM", "AI workflows", "Next.js", "TypeScript", "human review", "automation"],
      keywordsExcluded: baseExcluded,
      excludedCompanies: ["RemoteOK"],
      minimumMatchScore: 78,
      rationale: "Your current products and GitHub work show credible AI-assisted SaaS and structured-output workflow experience.",
      evidence: evidenceContaining(bullets, ["openai", "structured outputs", "ai", "automation", "next.js", "typescript"]),
      githubEvidence: evidenceRepos(repos, ["ai", "llm", "avatar", "progression", "openai"]),
    },
    {
      name: "Data-Rich Admin / Enterprise Workflow UI",
      searchIntent: "custom",
      remotePreference: "remote_us_only",
      relocationPreference: "unknown",
      titles: ["Senior Frontend Engineer", "Staff Frontend Engineer", "Senior Product Engineer", "Senior UI Engineer"],
      jobTypes: ["frontend", "data_visualization", "saas", "staff"],
      countries: ["United States"],
      salaryCurrency: "USD",
      salaryMin: 170000,
      industries: ["enterprise SaaS", "admin consoles", "workflow software", "analytics"],
      keywordsRequired: [],
      keywordsPreferred: ["admin console", "enterprise workflows", "data-rich UI", "React", "TypeScript", "forms", "API integrations"],
      keywordsExcluded: baseExcluded,
      excludedCompanies: ["RemoteOK"],
      minimumMatchScore: 74,
      rationale: "A lot of your strongest experience is not just frontend, it is complex internal/admin workflows for enterprise users.",
      evidence: evidenceContaining(bullets, ["admin", "enterprise", "workflow", "forms", "api", "data", "analytics"]),
      githubEvidence: repoEvidence,
    },
  ];

  if (/defense|mission|geospatial|sensor|command|control|axon|general dynamics|stryker/.test(text)) {
    suggestions.push({
      name: "Mission Software / Operational UI",
      searchIntent: "industry_specific",
      remotePreference: "any",
      relocationPreference: "open_to_relocation",
      titles: ["Senior UI Engineer", "Mission Software Engineer", "Senior Frontend Engineer", "Full Stack Engineer"],
      jobTypes: ["frontend", "fullstack", "defense", "data_visualization"],
      countries: ["United States"],
      salaryCurrency: "USD",
      salaryMin: 175000,
      industries: ["defense", "aerospace", "mission software", "geospatial", "public safety"],
      keywordsRequired: [],
      keywordsPreferred: ["operational UI", "real-time data", "mission planning", "sensor data", "command and control", "geospatial", "React", "TypeScript"],
      keywordsExcluded: baseExcluded,
      excludedCompanies: ["RemoteOK"],
      minimumMatchScore: 72,
      rationale: "General Dynamics and AXON/TASER work support an adjacent mission/operational UI search lane.",
      evidence: evidenceContaining(bullets, ["general dynamics", "stryker", "axon", "law enforcement", "video", "gps", "defense", "operational"]),
      githubEvidence: evidenceRepos(repos, ["emf", "simulation", "visualization", "map"]),
    });
  }

  return normalizeSuggestions(suggestions);
}

function normalizeSuggestions(suggestions: ProfileSuggestion[]): ProfileSuggestion[] {
  return suggestions.map((suggestion) => ({
    ...suggestion,
    titles: unique(suggestion.titles).slice(0, 8),
    jobTypes: unique(suggestion.jobTypes).slice(0, 8),
    countries: unique(suggestion.countries).slice(0, 8),
    industries: unique(suggestion.industries).slice(0, 8),
    keywordsRequired: unique(suggestion.keywordsRequired).slice(0, 8),
    keywordsPreferred: unique(suggestion.keywordsPreferred).slice(0, 16),
    keywordsExcluded: unique([...suggestion.keywordsExcluded, "pay to apply", "application fee", "commission only", "unpaid", "equity only"]).slice(0, 12),
    excludedCompanies: unique([...suggestion.excludedCompanies, "RemoteOK"]).slice(0, 12),
    minimumMatchScore: Math.max(65, Math.min(90, suggestion.minimumMatchScore)),
  }));
}

function evidenceContaining(bullets: ExperienceBullet[], terms: string[]) {
  return bullets
    .filter((bullet) => terms.some((term) => bullet.text.toLowerCase().includes(term)))
    .map((bullet) => `${bullet.company}: ${bullet.text}`)
    .slice(0, 5);
}

function evidenceRepos(repos: GithubRepository[], terms: string[]) {
  return repos
    .filter((repo) => terms.some((term) => `${repo.name} ${repo.description ?? ""} ${jsonStringArray(repo.topics).join(" ")}`.toLowerCase().includes(term)))
    .map((repo) => `${repo.name}${repo.description ? `: ${repo.description}` : ""}`)
    .slice(0, 5);
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
