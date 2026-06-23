import { describe, expect, it, vi } from "vitest";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { tailorResumeForJob } from "./resume";
import type { ExperienceBullet, GithubRepository, JobPosting, Project, UserProfile, WorkExperience } from "@prisma/client";

vi.mock("@/lib/ai/openai", () => ({
  isOpenAiConfigured: vi.fn(() => true),
  parseStructuredOutput: vi.fn(),
}));

const parseStructuredOutputMock = vi.mocked(parseStructuredOutput);

describe("tailorResumeForJob", () => {
  it("keeps every supplied work experience in Professional Experience", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: {
        id: "profile_1",
        userId: "user_1",
        fullName: "Carl Welch",
        email: "carl@example.com",
        phone: null,
        location: "Remote",
        linkedinUrl: null,
        linkedinSubject: null,
        linkedinPictureUrl: null,
        linkedinLocale: null,
        linkedinEmailVerified: null,
        linkedinConnectedAt: null,
        githubUrl: null,
        portfolioUrl: null,
        raceAnswer: null,
        genderAnswer: null,
        veteranStatusAnswer: null,
        disabilityAnswer: null,
        masterSummary: "Senior product engineer.",
        professionalSummary: "Senior product engineer building React and TypeScript products.",
        yearsExperience: 20,
        primaryRoles: [],
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["Next.js", "Prisma"],
        industries: [],
        domainExpertise: [],
        createdAt: now,
        updatedAt: now,
      } satisfies UserProfile,
      job: {
        id: "job_1",
        sourceId: null,
        sourceJobId: null,
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote",
        country: null,
        city: null,
        remoteType: "remote",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        description: "React TypeScript frontend product engineering.",
        requirements: [],
        niceToHaves: [],
        benefits: [],
        applicationUrl: null,
        atsProvider: "unknown",
        rawData: {},
        contentHash: "hash",
        duplicateGroupId: null,
        staleScore: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      } satisfies JobPosting,
      bullets: [
        experienceBullet({
          id: "bullet_1",
          company: "CurrentCo",
          role: "Senior Engineer",
          text: "Built React and TypeScript product workflows for high-trust users.",
          keywords: ["React", "TypeScript"],
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_1",
          company: "CurrentCo",
          title: "Senior Engineer",
          startDate: "2022",
          endDate: "Present",
          isCurrent: true,
          summary: "Built product workflows.",
          skills: ["React", "TypeScript"],
          createdAt: now,
        }),
        workExperience({
          id: "work_2",
          company: "EarlierCo",
          title: "Frontend Engineer",
          startDate: "2018",
          endDate: "2021",
          summary: "Built and maintained customer-facing web applications.",
          createdAt: new Date("2021-01-01T12:00:00Z"),
        }),
      ],
    });

    expect(tailored.markdownResume).toContain("### CurrentCo - Senior Engineer | 2022 - Present");
    expect(tailored.markdownResume).toContain("Skills: React, TypeScript");
    expect(tailored.markdownResume).toContain("### EarlierCo - Frontend Engineer | 2018 - 2021");
    expect(tailored.markdownResume).toContain("- Built and maintained customer-facing web applications.");
  });

  it("does not emit internal continuity placeholder bullets for roles without details", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: {
        id: "profile_1",
        userId: "user_1",
        fullName: "Carl Welch",
        email: "carl@example.com",
        phone: null,
        location: "Remote",
        linkedinUrl: null,
        linkedinSubject: null,
        linkedinPictureUrl: null,
        linkedinLocale: null,
        linkedinEmailVerified: null,
        linkedinConnectedAt: null,
        githubUrl: null,
        portfolioUrl: null,
        raceAnswer: null,
        genderAnswer: null,
        veteranStatusAnswer: null,
        disabilityAnswer: null,
        masterSummary: "Senior product engineer.",
        professionalSummary: "Senior product engineer building React and TypeScript products.",
        yearsExperience: 20,
        primaryRoles: [],
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["Next.js", "Prisma"],
        industries: [],
        domainExpertise: [],
        createdAt: now,
        updatedAt: now,
      } satisfies UserProfile,
      job: {
        id: "job_1",
        sourceId: null,
        sourceJobId: null,
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote",
        country: null,
        city: null,
        remoteType: "remote",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        description: "React TypeScript frontend product engineering.",
        requirements: [],
        niceToHaves: [],
        benefits: [],
        applicationUrl: null,
        atsProvider: "unknown",
        rawData: {},
        contentHash: "hash",
        duplicateGroupId: null,
        staleScore: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      } satisfies JobPosting,
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_1",
          company: "The David Allen Company",
          title: "Art Director / Full Stack Developer",
          startDate: "Jan 2004",
          endDate: "Feb 2009",
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain("### The David Allen Company - Art Director / Full Stack Developer | Jan 2004 - Feb 2009");
    expect(tailored.markdownResume).not.toMatch(/verified role|employment-history continuity|included for continuity/i);
    expect(tailored.markdownResume).toContain(
      "- Contributed to Art Director / Full Stack Developer responsibilities across product delivery, execution, and cross-functional collaboration.",
    );
  });

  it("renders recruiter-format app context and approved tech without needs-review versions", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: {
        id: "profile_1",
        userId: "user_1",
        fullName: "Carl Welch",
        email: "carl@example.com",
        phone: null,
        location: "Remote",
        linkedinUrl: null,
        linkedinSubject: null,
        linkedinPictureUrl: null,
        linkedinLocale: null,
        linkedinEmailVerified: null,
        linkedinConnectedAt: null,
        githubUrl: null,
        portfolioUrl: null,
        raceAnswer: null,
        genderAnswer: null,
        veteranStatusAnswer: null,
        disabilityAnswer: null,
        masterSummary: "Senior product engineer.",
        professionalSummary: "Senior product engineer building React and TypeScript products.",
        yearsExperience: 20,
        primaryRoles: [],
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["Next.js", "Prisma"],
        industries: [],
        domainExpertise: [],
        createdAt: now,
        updatedAt: now,
      } satisfies UserProfile,
      job: {
        id: "job_1",
        sourceId: null,
        sourceJobId: null,
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote",
        country: null,
        city: null,
        remoteType: "remote",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        description: "React TypeScript frontend product engineering.",
        requirements: [],
        niceToHaves: [],
        benefits: [],
        applicationUrl: null,
        atsProvider: "unknown",
        rawData: {},
        contentHash: "hash",
        duplicateGroupId: null,
        staleScore: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      } satisfies JobPosting,
      bullets: [
        experienceBullet({
          id: "bullet_1",
          company: "Revenue.io",
          role: "Senior Software Engineer",
          text: "Built React and TypeScript guided selling workflows for enterprise sales teams.",
          keywords: ["React", "TypeScript"],
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_1",
          company: "Revenue.io",
          title: "Senior Software Engineer",
          startDate: "Mar 2020",
          endDate: "Sep 2022",
          summary: "Built guided selling workflows.",
          resumeContext: {
            applicationTitle: "Guided Selling Platform",
            applicationSummary: "Built sales engagement workflows for enterprise sales teams.",
            users: "Sales teams used the platform to manage guided selling workflows.",
            scaleImpact: "Supported enterprise sales operations.",
            confirmedTech: [{ name: "React", version: "17", source: "user_confirmed" }],
            versionSuggestions: [{
              id: "typescript:3.x-4.x",
              name: "TypeScript",
              suggestedVersion: "3.x-4.x",
              confidence: 0.56,
              rationale: "Estimated from role dates.",
              status: "NEEDS_REVIEW",
              source: "date_window",
              evidence: ["TypeScript"],
            }],
          },
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain("### Revenue.io - Senior Software Engineer | Mar 2020 - Sep 2022");
    expect(tailored.markdownResume).toContain("Skills: React 17");
    expect(tailored.markdownResume).not.toContain("Tech Used:");
    expect(tailored.markdownResume).not.toContain("TypeScript 3.x-4.x");
    expect(tailored.markdownResume).not.toMatch(/likely|estimated|inferred|available at the time/i);
  });

  it("does not duplicate a curated project with its backing GitHub repository", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [
        project({
          id: "project_1",
          name: "Job Search OS",
          repoUrl: "https://github.com/carlwelchdesign/jobsearch-dashboard-ai",
          description: "Local-first AI-powered job search operating system coordinating specialized agents and application workflows.",
          technologies: ["Next.js", "TypeScript", "React", "Prisma", "PostgreSQL"],
          createdAt: now,
        }),
      ],
      githubRepositories: [
        githubRepository({
          id: "repo_1",
          name: "jobsearch-dashboard-ai",
          fullName: "carlwelchdesign/jobsearch-dashboard-ai",
          htmlUrl: "https://github.com/carlwelchdesign/jobsearch-dashboard-ai",
          description: "Local-first AI job search dashboard that discovers and scores roles.",
          language: "TypeScript",
          topics: ["job-search", "nextjs", "react", "postgresql"],
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain("- Job Search OS:");
    expect(tailored.markdownResume).not.toContain("- jobsearch-dashboard-ai:");
    expect(tailored.markdownResume).not.toContain("Relevant strengths include");
    expect(tailored.markdownResume).not.toContain("Selected strengths for");
    expect(tailored.markdownResume).not.toContain("Selected for");

    const promptInput = parseStructuredOutputMock.mock.calls.at(-1)?.[0].input as {
      githubRepositories?: Array<{ name: string }>;
    };
    expect(promptInput.githubRepositories).toEqual([]);
  });

  it("strips generated summary scaffold language from AI output", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    parseStructuredOutputMock.mockResolvedValueOnce({
      tailoredSummary: "Senior engineer.",
      selectedSkills: ["React"],
      selectedExperienceBullets: [],
      projectSelections: [],
      keywordAlignment: { matchedTerms: ["React"], method: "test" },
      markdownResume: [
        "# Carl Welch",
        "",
        "## Summary",
        "Senior engineer building React systems. Selected strengths for Close's Senior Engineer role include React, frontend architecture.",
        "",
        "## Skills",
        "React",
        "",
        "## Professional Experience",
        ...Array.from({ length: 18 }, (_, index) => `- Built verified product workflow ${index + 1} with React, TypeScript, API integration, testing coverage, component architecture, and cross-functional delivery for enterprise users.`),
      ].join("\n"),
      plainTextResume: [
        "Carl Welch",
        "",
        "Summary",
        "Senior engineer building React systems. Selected strengths for Close's Senior Engineer role include React, frontend architecture.",
        "",
        "Skills",
        "React",
        "",
        "Professional Experience",
        ...Array.from({ length: 18 }, (_, index) => `- Built verified product workflow ${index + 1} with React, TypeScript, API integration, testing coverage, component architecture, and cross-functional delivery for enterprise users.`),
      ].join("\n"),
      warnings: [],
      unsupportedClaimsDetected: [],
      validation: null,
    }).mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, { linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/" }),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [],
      githubRepositories: [],
    });

    expect(tailored.markdownResume).toContain("Senior engineer building React systems.");
    expect(tailored.markdownResume).toContain("https://www.linkedin.com/in/carlwelchdesign");
    expect(tailored.markdownResume).toContain("https://github.com/carlwelchdesign");
    expect(tailored.markdownResume).not.toContain("Selected strengths for");
    expect(tailored.plainTextResume).not.toContain("Selected strengths for");
  });

  it("derives the GitHub profile link from synced repositories when profile github is missing", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        githubUrl: null,
        linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/",
      }),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [],
      githubRepositories: [
        githubRepository({
          id: "repo_1",
          name: "progression-lab-ai",
          fullName: "carlwelchdesign/progression-lab-ai",
          htmlUrl: "https://github.com/carlwelchdesign/progression-lab-ai",
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume.split("\n").slice(0, 3).join("\n")).toContain("https://www.linkedin.com/in/carlwelchdesign");
    expect(tailored.markdownResume.split("\n").slice(0, 3).join("\n")).toContain("https://github.com/carlwelchdesign");
  });

  it("omits incomplete social profile roots and derives GitHub from repositories", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        githubUrl: "https://github.com/",
        linkedinUrl: "https://www.linkedin.com/in/",
      }),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [],
      githubRepositories: [
        githubRepository({
          id: "repo_1",
          name: "jobsearch-dashboard-ai",
          fullName: "carlwelchdesign/jobsearch-dashboard-ai",
          htmlUrl: "https://github.com/carlwelchdesign/jobsearch-dashboard-ai",
          createdAt: now,
        }),
      ],
    });

    const contactLine = tailored.markdownResume.split("\n")[1];
    const contactParts = contactLine.split(" | ");
    expect(contactParts).not.toContain("https://www.linkedin.com/in/");
    expect(contactParts).not.toContain("https://github.com/");
    expect(contactLine).toContain("https://github.com/carlwelchdesign");
  });
});

function userProfile(now: Date, patch: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "profile_1",
    userId: "user_1",
    fullName: "Carl Welch",
    email: "carl@example.com",
    phone: null,
    location: "Remote",
    linkedinUrl: null,
    linkedinSubject: null,
    linkedinPictureUrl: null,
    linkedinLocale: null,
    linkedinEmailVerified: null,
    linkedinConnectedAt: null,
    githubUrl: "https://github.com/carlwelchdesign",
    portfolioUrl: null,
    raceAnswer: null,
    genderAnswer: null,
    veteranStatusAnswer: null,
    disabilityAnswer: null,
    masterSummary: "Senior product engineer.",
    professionalSummary: "Senior product engineer building React and TypeScript products.",
    yearsExperience: 20,
    primaryRoles: [],
    coreSkills: ["React", "TypeScript"],
    technicalSkills: ["Next.js", "Prisma"],
    industries: [],
    domainExpertise: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function jobPosting(now: Date): JobPosting {
  return {
    id: "job_1",
    sourceId: null,
    sourceJobId: null,
    company: "Acme",
    title: "Senior Frontend Engineer",
    location: "Remote",
    country: null,
    city: null,
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    description: "React TypeScript frontend product engineering.",
    requirements: [],
    niceToHaves: [],
    benefits: [],
    applicationUrl: null,
    atsProvider: "unknown",
    rawData: {},
    contentHash: "hash",
    duplicateGroupId: null,
    staleScore: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function experienceBullet(input: Partial<ExperienceBullet> & Pick<ExperienceBullet, "id" | "company" | "role" | "text" | "createdAt">): ExperienceBullet {
  return {
    userProfileId: "profile_1",
    workExperienceId: null,
    category: "frontend",
    metrics: {},
    keywords: [],
    sourceText: input.text,
    truthLevel: "verified",
    sourceResumeUploadId: null,
    updatedAt: input.createdAt,
    ...input,
  };
}

function workExperience(input: Partial<WorkExperience> & Pick<WorkExperience, "id" | "company" | "title" | "createdAt">): WorkExperience {
  return {
    userProfileId: "profile_1",
    location: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    summary: null,
    skills: [],
    achievements: [],
    resumeContext: {},
    sourceResumeUploadId: null,
    updatedAt: input.createdAt,
    ...input,
  };
}

function project(input: Partial<Project> & Pick<Project, "id" | "name" | "createdAt">): Project {
  return {
    userProfileId: "profile_1",
    description: null,
    url: null,
    repoUrl: null,
    technologies: [],
    highlights: [],
    sourceResumeUploadId: null,
    updatedAt: input.createdAt,
    ...input,
  };
}

function githubRepository(input: Partial<GithubRepository> & Pick<GithubRepository, "id" | "name" | "fullName" | "htmlUrl" | "createdAt">): GithubRepository {
  return {
    userProfileId: "profile_1",
    githubId: input.fullName,
    description: null,
    homepage: null,
    readmeText: null,
    wikiText: null,
    language: null,
    topics: [],
    stars: 0,
    forks: 0,
    isFork: false,
    isArchived: false,
    pushedAt: null,
    rawData: {},
    updatedAt: input.createdAt,
    ...input,
  };
}
