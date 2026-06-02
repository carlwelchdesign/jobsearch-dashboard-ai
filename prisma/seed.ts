import { PrismaClient } from "@prisma/client";
import { upsertApplicationAnswerMemory } from "../src/lib/application-answer-memory";
import { syncJobSearchOsProjectEvidence } from "../src/lib/evidence/ingest";
import { configToPrismaJson, defaultCompanySourceConfig } from "../src/lib/job-search/company-source-config";
import { prisma as appPrisma } from "../src/lib/prisma";
import { defaultResumeProfiles, resumeProfileJson } from "../src/lib/resume-profiles/defaults";

const prisma = new PrismaClient();

const userEmail = process.env.SEED_USER_EMAIL ?? "carl@example.com";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      name: "Carl Welch",
      profile: {
        create: {
          fullName: "Carl Welch",
          email: userEmail,
          location: "United States",
          linkedinUrl: "https://www.linkedin.com/in/",
          githubUrl: "https://github.com/",
          portfolioUrl: "https://",
          masterSummary:
            "Senior frontend/full-stack engineer with 20+ years of experience building React, TypeScript, Next.js, SaaS, security, AI-assisted, and data-rich product experiences.",
        },
      },
      notificationSettings: {
        create: {
          emailEnabled: true,
          emailAddress: userEmail,
          pushoverEnabled: false,
          notifyOnlyIfNewMatches: true,
          minimumScoreForPush: 85,
          digestMode: "strong_matches_only",
        },
      },
    },
    include: { profile: true },
  });

  const profiles = [
    {
      name: "US Remote Senior/Staff Frontend",
      searchIntent: "us_remote",
      remotePreference: "remote_us_only",
      countries: ["United States"],
      titles: [
        "Senior Frontend Engineer",
        "Staff Frontend Engineer",
        "Senior Full Stack Engineer",
        "Staff Full Stack Engineer",
        "Frontend Platform Engineer",
        "Senior UI Engineer",
      ],
      salaryCurrency: "USD",
      salaryMin: 175000,
      includeUnknownSalary: true,
      minimumMatchScore: 75,
    },
    {
      name: "Global Remote AI / Full-Stack",
      searchIntent: "global_remote",
      remotePreference: "remote_global",
      titles: [
        "Senior Full Stack Engineer",
        "AI Product Engineer",
        "Senior Frontend Engineer",
        "Developer Tools Engineer",
        "Staff Software Engineer",
      ],
      keywordsPreferred: [
        "remote worldwide",
        "async",
        "distributed team",
        "AI",
        "LLM",
        "Next.js",
        "TypeScript",
      ],
      salaryCurrency: "USD",
      salaryMin: 150000,
      includeUnknownSalary: true,
      minimumMatchScore: 78,
    },
    {
      name: "Europe Relocation-Friendly Roles",
      searchIntent: "europe_relocation",
      remotePreference: "onsite_relocation",
      relocationPreference: "requires_relocation_support",
      countries: ["Germany", "Sweden", "Luxembourg", "Netherlands", "Denmark", "Ireland"],
      titles: [
        "Senior Frontend Engineer",
        "Senior Full Stack Engineer",
        "Staff Engineer",
        "AI Product Engineer",
      ],
      keywordsPreferred: [
        "relocation",
        "visa sponsorship",
        "work permit",
        "EU Blue Card",
        "international candidates",
        "English-speaking",
      ],
      salaryCurrency: "EUR",
      salaryMin: 90000,
      includeUnknownSalary: true,
      minimumMatchScore: 72,
    },
    {
      name: "Security SaaS / Identity / WebAuthn",
      searchIntent: "industry_specific",
      remotePreference: "remote_us_only",
      titles: [
        "Senior Frontend Engineer",
        "Staff Frontend Engineer",
        "Senior Full Stack Engineer",
        "Frontend Platform Engineer",
      ],
      industries: ["security", "identity", "authentication", "access management", "SaaS"],
      keywordsPreferred: [
        "WebAuthn",
        "passkeys",
        "MFA",
        "authentication",
        "identity",
        "enterprise security",
        "admin console",
      ],
      salaryCurrency: "USD",
      salaryMin: 175000,
      minimumMatchScore: 75,
    },
    {
      name: "Defense / Mission Software UI",
      searchIntent: "industry_specific",
      remotePreference: "any",
      titles: [
        "Mission Software Engineer",
        "Senior UI Engineer",
        "Senior Frontend Engineer",
        "Full Stack Engineer",
        "Software Engineer, Frontend",
      ],
      industries: ["defense", "aerospace", "autonomy", "mission software", "geospatial"],
      keywordsPreferred: [
        "React",
        "TypeScript",
        "operational UI",
        "real-time data",
        "visualization",
        "command and control",
        "mission planning",
        "sensor data",
      ],
      salaryCurrency: "USD",
      salaryMin: 175000,
      includeUnknownSalary: true,
      minimumMatchScore: 72,
    },
  ] as const;

  const excludedCompanies = ["RemoteOK"];
  const keywordsExcluded = [
    "pay to apply",
    "application fee",
    "paid application",
    "candidate fee",
    "applicant fee",
    "placement fee",
    "commission only",
    "unpaid",
    "equity only",
  ];

  for (const profile of profiles) {
    await prisma.jobSearchProfile.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: profile.name,
        },
      },
      update: {
        ...profile,
        excludedCompanies,
        keywordsExcluded,
      },
      create: {
        userId: user.id,
        ...profile,
        excludedCompanies,
        keywordsExcluded,
      },
    });
  }

  const targetCompanySlugs = [
    "1password",
    "airbnb",
    "airtable",
    "andurilindustries",
    "anthropic",
    "ashby",
    "atlassian",
    "brave",
    "canonical",
    "cloudflare",
    "coinbase",
    "cursor",
    "datadog",
    "discord",
    "figma",
    "github",
    "gitlab",
    "grafana",
    "hashicorp",
    "huggingface",
    "linear",
    "mercury",
    "mistral",
    "mozilla",
    "notion",
    "okta",
    "openai",
    "palantir",
    "perplexityai",
    "ramp",
    "replit",
    "rippling",
    "scaleai",
    "stripe",
    "supabase",
    "vercel",
    "yubico",
  ];

  const sources = [
    { name: "Manual Paste", type: "manual", baseUrl: null, enabled: true, config: {} },
    {
      name: "Company Source List",
      type: "company_site",
      baseUrl: null,
      enabled: true,
      config: configToPrismaJson(defaultCompanySourceConfig()),
    },
    { name: "Greenhouse", type: "greenhouse", baseUrl: "https://boards.greenhouse.io", enabled: true, config: { qualityTier: "direct_ats", companySlugs: targetCompanySlugs, maxCompanies: 40, maxFetch: 600 } },
    { name: "Lever", type: "lever", baseUrl: "https://jobs.lever.co", enabled: true, config: { qualityTier: "direct_ats", companySlugs: targetCompanySlugs, maxCompanies: 40, maxFetch: 500 } },
    { name: "Ashby", type: "ashby", baseUrl: "https://jobs.ashbyhq.com", enabled: true, config: { qualityTier: "direct_ats", companySlugs: targetCompanySlugs, maxCompanies: 40, maxFetch: 500 } },
    {
      name: "Search Query Backlog",
      type: "search_query",
      baseUrl: "https://search.brave.com",
      enabled: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      config: {
        qualityTier: "search_query",
        provider: "brave",
        queries: [
          'site:jobs.ashbyhq.com "Senior Frontend Engineer" "remote"',
          'site:boards.greenhouse.io "Staff Frontend Engineer" "React" "TypeScript"',
          'site:jobs.lever.co "Product Engineer" "AI" "remote"',
          'site:workdayjobs.com "React" "remote" "Senior"',
          'site:smartrecruiters.com "Frontend Engineer" "United States"',
          '"Senior Frontend Engineer" "React" "TypeScript" "remote" "salary"',
          '"Staff Software Engineer" "design systems" "remote"',
          '"Developer Experience Engineer" "React" "TypeScript"',
          '"WebAuthn" "Frontend Engineer" "remote"',
          '"Mission Software Engineer" "React" "TypeScript"',
        ],
        maxResultsPerQuery: 8,
        maxFetch: Number(process.env.SEARCH_QUERY_MAX_RESULTS ?? 80),
      },
    },
    {
      name: "Defense Tech Jobs",
      type: "jobfront",
      baseUrl: "https://jobs.frontdoordefense.com",
      enabled: true,
      config: {
        qualityTier: "jobfront_board",
        boardUrl: "https://jobs.frontdoordefense.com",
        organizationId: "ODefenseTechJobsfMgO449pvH",
        maxFetch: 160,
      },
    },
    { name: "RemoteOK", type: "remoteok", baseUrl: "https://remoteok.com", enabled: false, config: { qualityTier: "blocked_job_board", reason: "paywalled/apply friction", maxFetch: 0 } },
    { name: "We Work Remotely", type: "weworkremotely", baseUrl: "https://weworkremotely.com", enabled: false, config: { qualityTier: "intermediary_job_board", reason: "job-board listings, Cloudflare friction, not final ATS forms", maxFetch: 0 } },
  ] as const;

  for (const source of sources) {
    await prisma.jobSource.upsert({
      where: { type_name: { type: source.type, name: source.name } },
      update: { baseUrl: source.baseUrl, enabled: source.enabled, config: source.config },
      create: source,
    });
  }

  for (const resumeProfile of defaultResumeProfiles) {
    await prisma.resumeProfile.upsert({
      where: { userId_name: { userId: user.id, name: resumeProfile.name } },
      update: {
        description: resumeProfile.description,
        targetRoles: resumeProfileJson(resumeProfile.targetRoles),
        positioningSummary: resumeProfile.positioningSummary,
        evidenceTags: resumeProfileJson(resumeProfile.evidenceTags),
        priorityProjects: resumeProfileJson(resumeProfile.priorityProjects),
        defaultSections: resumeProfileJson(resumeProfile.defaultSections),
      },
      create: {
        userId: user.id,
        name: resumeProfile.name,
        description: resumeProfile.description,
        targetRoles: resumeProfileJson(resumeProfile.targetRoles),
        positioningSummary: resumeProfile.positioningSummary,
        evidenceTags: resumeProfileJson(resumeProfile.evidenceTags),
        priorityProjects: resumeProfileJson(resumeProfile.priorityProjects),
        defaultSections: resumeProfileJson(resumeProfile.defaultSections),
      },
    });
  }

  if (user.profile) {
    await syncJobSearchOsProjectEvidence(user.profile.id);
    await upsertApplicationAnswerMemory({
      userId: user.id,
      questionText: "How did you find this job posting?",
      answer: "I found it through a personal job search tool that monitors curated company career pages and direct ATS feeds for roles aligned with my background.",
      sensitivity: "LOW",
      reusePolicy: "AUTO_USE",
    });

    const bullets = [
      {
        category: "frontend",
        company: "Recent SaaS roles",
        role: "Senior Frontend / Full-Stack Engineer",
        text: "Built data-rich React and TypeScript interfaces for complex enterprise workflows, with emphasis on scanability, performance, and maintainable component boundaries.",
        keywords: ["React", "TypeScript", "enterprise UI", "SaaS"],
      },
      {
        category: "security",
        company: "Security product work",
        role: "Frontend / Full-Stack Engineer",
        text: "Delivered authentication and identity product experiences involving WebAuthn, passkeys, MFA, and admin-facing security controls.",
        keywords: ["WebAuthn", "passkeys", "MFA", "identity"],
      },
      {
        category: "ai",
        company: "AI-assisted SaaS products",
        role: "Full-Stack Engineer",
        text: "Integrated OpenAI structured outputs into product workflows to produce predictable JSON results for reviewable user-facing automation.",
        keywords: ["OpenAI", "structured outputs", "LLM", "automation"],
      },
    ] as const;

    for (const bullet of bullets) {
      const existing = await prisma.experienceBullet.findFirst({
        where: {
          userProfileId: user.profile.id,
          text: bullet.text,
        },
      });
      if (!existing) {
        await prisma.experienceBullet.create({
          data: {
            userProfileId: user.profile.id,
            ...bullet,
            truthLevel: "verified",
            metrics: {},
          },
        });
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]);
  });
