import { PrismaClient } from "@prisma/client";
import { upsertApplicationAnswerMemory } from "../src/lib/application-answer-memory";
import { syncJobSearchOsProjectEvidence } from "../src/lib/evidence/ingest";
import { configToPrismaJson, defaultCompanySourceConfig } from "../src/lib/job-search/company-source-config";
import { defaultSearchQuerySourceConfig, mergeSearchQuerySourceConfig } from "../src/lib/job-search/source-catalog";
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
      name: "Broad LinkedIn Parity Review",
      searchIntent: "custom",
      remotePreference: "any",
      countries: ["United States"],
      titles: [
        "Senior Software Engineer",
        "Senior Full Stack Engineer",
        "Senior Frontend Engineer",
        "Product Engineer",
        "Full-Stack Product Engineer",
        "React Engineer",
        "TypeScript Engineer",
        "UI Engineer",
        "Design Systems Engineer",
        "AI Product Engineer",
        "Staff Software Engineer",
      ],
      keywordsPreferred: [
        "React",
        "TypeScript",
        "JavaScript",
        "frontend",
        "full stack",
        "full-stack",
        "product engineer",
        "product UI",
        "web platform",
        "design systems",
        "component library",
        "Next.js",
        "AI product",
        "LLM",
        "agent",
        "workflow",
        "dashboard",
        "remote",
        "United States",
        "US",
        "global",
      ],
      salaryCurrency: "USD",
      salaryMin: 140000,
      includeUnknownSalary: true,
      minimumMatchScore: 62,
      maxResultsPerRun: 250,
      excludedTitles: [
        "Manager",
        "Director",
        "Advocate",
        "Developer Relations",
        "DevRel",
        "Instructor",
        "Curriculum",
        "Support Engineer",
        "Sales Engineer",
      ],
    },
    {
      name: "US Remote Senior Frontend",
      searchIntent: "us_remote",
      remotePreference: "remote_us_only",
      countries: ["United States"],
      titles: [
        "Senior Frontend Engineer",
        "Senior Full Stack Engineer",
        "Senior Software Engineer, Full-stack",
        "Frontend Platform Engineer",
        "Senior UI Engineer",
        "Staff UI Software Engineer",
        "Design Engineer, Web",
      ],
      keywordsPreferred: [
        "React",
        "TypeScript",
        "frontend",
        "UI",
        "web",
        "product UI",
        "SaaS workflows",
        "dashboards",
        "design systems",
        "Storybook",
        "component library",
        "Claude",
        "Claude Design",
        "AI product",
        "AI-native UX",
        "real-time editing",
        "accessibility testing",
        "accessibility",
        "API integrations",
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
        "Senior Software Engineer, Full-stack",
        "Full-Stack Product Engineer",
        "Senior Frontend Engineer",
        "Senior UI Engineer",
        "Software Engineer, Claude Design",
        "Staff UI Software Engineer",
        "Design Engineer, Web",
        "Staff Software Engineer, Accessibility",
      ],
      keywordsPreferred: [
        "remote worldwide",
        "async",
        "distributed team",
        "React",
        "TypeScript",
        "frontend",
        "UI",
        "web",
        "product UI",
        "SaaS workflows",
        "dashboards",
        "design systems",
        "Storybook",
        "component library",
        "Claude",
        "Claude Design",
        "AI product",
        "AI-driven generation",
        "enterprise deployments",
        "admin analytics",
        "identity",
        "permissions",
        "MCP",
        "retrieval",
        "context workflows",
        "streaming UI",
        "accessibility testing",
        "accessibility",
        "API integrations",
        "Next.js",
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
        "Senior Software Engineer, Full-stack",
        "Senior UI Engineer",
        "Design Engineer, Web",
      ],
      keywordsPreferred: [
        "relocation",
        "visa sponsorship",
        "work permit",
        "EU Blue Card",
        "international candidates",
        "English-speaking",
        "React",
        "TypeScript",
        "frontend",
        "UI",
        "web",
        "product UI",
        "design systems",
        "Storybook",
        "component library",
        "AI product",
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
        "Senior Full Stack Engineer",
        "Senior Software Engineer, Full-stack",
        "Frontend Platform Engineer",
        "Staff Software Engineer, Accessibility",
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
        "React",
        "TypeScript",
        "frontend",
        "UI",
        "web",
        "accessibility",
        "API integrations",
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
  const excludedTitles = [
    "Principal",
    "Principle",
    "Lead",
    "Manager",
    "Director",
    "Architect",
    "Advocate",
    "Developer Relations",
    "DevRel",
    "Instructor",
    "Curriculum",
    "Data Engineer",
    "Backend Engineer",
    "Solutions",
    "Transformation",
    "Forward Deployed",
    "Support Engineer",
  ];
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
    const profileExcludedTitles = "excludedTitles" in profile ? profile.excludedTitles : excludedTitles;
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
        excludedTitles: profileExcludedTitles,
        keywordsExcluded,
      },
      create: {
        userId: user.id,
        ...profile,
        excludedCompanies,
        excludedTitles: profileExcludedTitles,
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
      config: defaultSearchQuerySourceConfig(),
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
    {
      name: "Netflix Careers",
      type: "eightfold",
      baseUrl: "https://explore.jobs.netflix.net/careers",
      enabled: true,
      config: {
        qualityTier: "company_careers_page",
        careersUrl: "https://explore.jobs.netflix.net/careers",
        domain: "netflix.com",
        provider: "eightfold",
        queryTerms: ["Frontend Engineer", "Software Engineer", "React", "TypeScript", "AI Engineer", "Developer Experience", "Design Systems"],
        maxFetch: 160,
      },
    },
    { name: "RemoteOK", type: "remoteok", baseUrl: "https://remoteok.com", enabled: false, config: { qualityTier: "blocked_job_board", reason: "paywalled/apply friction", maxFetch: 0 } },
    { name: "We Work Remotely", type: "weworkremotely", baseUrl: "https://weworkremotely.com", enabled: false, config: { qualityTier: "intermediary_job_board", reason: "job-board listings, Cloudflare friction, not final ATS forms", maxFetch: 0 } },
  ] as const;

  for (const source of sources) {
    const existing = await prisma.jobSource.findUnique({ where: { type_name: { type: source.type, name: source.name } } });
    await prisma.jobSource.upsert({
      where: { type_name: { type: source.type, name: source.name } },
      update: {
        baseUrl: source.baseUrl,
        enabled: source.enabled,
        config: source.type === "search_query" ? mergeSearchQuerySourceConfig(existing?.config) : source.config,
      },
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
