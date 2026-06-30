import { describe, expect, it, vi } from "vitest";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { generateCoverLetterForJob, tailorResumeForJob } from "./resume";
import type {
  ExperienceBullet,
  GithubRepository,
  JobPosting,
  Project,
  UserProfile,
  WorkExperience,
} from "@prisma/client";

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
        resumeFormat: "modern_two_column",
        masterSummary: "Senior product engineer.",
        professionalSummary:
          "Senior product engineer building React and TypeScript products.",
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

    expect(tailored.markdownResume).toContain(
      "### CurrentCo - Senior Engineer | 2022 - Present",
    );
    expect(tailored.markdownResume).toContain("Skills: React, TypeScript");
    expect(tailored.markdownResume).toContain(
      "### EarlierCo - Frontend Engineer | 2018 - 2021",
    );
    expect(tailored.markdownResume).toContain(
      "- Built and maintained customer-facing web applications.",
    );
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
        resumeFormat: "modern_two_column",
        masterSummary: "Senior product engineer.",
        professionalSummary:
          "Senior product engineer building React and TypeScript products.",
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

    expect(tailored.markdownResume).toContain(
      "### The David Allen Company - Art Director / Full Stack Developer | Jan 2004 - Feb 2009",
    );
    expect(tailored.markdownResume).not.toMatch(
      /verified role|employment-history continuity|included for continuity/i,
    );
    expect(tailored.markdownResume).toContain(
      "- Contributed to Art Director / Full Stack Developer responsibilities across product delivery, execution, and cross-functional collaboration.",
    );
  });

  it("restores missing role skills when AI output includes the role headings", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const markdownResume = generatedResumeWithoutRoleSkills([
      "### Yubico - Senior Software Engineer | Jul 2022 - Mar 2026",
      ...longResumeBullets("Built identity admin console workflows"),
      "",
      "### Revenue.io - Senior Software Engineer | Mar 2020 - Jul 2022",
      ...longResumeBullets("Built sales engagement dashboards"),
    ]);
    parseStructuredOutputMock
      .mockResolvedValueOnce({
        tailoredSummary: "Senior engineer.",
        selectedSkills: ["React", "TypeScript", "Redux"],
        selectedExperienceBullets: [],
        projectSelections: [],
        keywordAlignment: {
          matchedTerms: ["React", "TypeScript", "Redux"],
          method: "test",
        },
        markdownResume,
        plainTextResume: markdownResume.replace(/^#+\s/gm, ""),
        warnings: [],
        unsupportedClaimsDetected: [],
        validation: null,
      })
      .mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_yubico",
          company: "Yubico",
          title: "Senior Software Engineer",
          startDate: "Jul 2022",
          endDate: "Mar 2026",
          skills: ["React", "TypeScript", "Redux", "Jest"],
          createdAt: now,
        }),
        workExperience({
          id: "work_revenue",
          company: "Revenue.io",
          title: "Senior Software Engineer",
          startDate: "Mar 2020",
          endDate: "Jul 2022",
          skills: ["React", "TypeScript", "Redux", "Backbone"],
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      [
        "### Yubico - Senior Software Engineer | Jul 2022 - Mar 2026",
        "Skills: React, TypeScript, Redux, Jest",
      ].join("\n"),
    );
    expect(tailored.markdownResume).toContain(
      [
        "### Revenue.io - Senior Software Engineer | Mar 2020 - Jul 2022",
        "Skills: React, TypeScript, Redux, Backbone",
      ].join("\n"),
    );
    expect(tailored.plainTextResume).toContain(
      [
        "Yubico - Senior Software Engineer | Jul 2022 - Mar 2026",
        "Skills: React, TypeScript, Redux, Jest",
      ].join("\n"),
    );
  });

  it("does not duplicate existing role skills when restoring missing lines", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const markdownResume = generatedResumeWithoutRoleSkills([
      "### Yubico - Senior Software Engineer | Jul 2022 - Mar 2026",
      "Skills: React, TypeScript, Redux, Jest",
      ...longResumeBullets("Built identity admin console workflows"),
    ]);
    parseStructuredOutputMock
      .mockResolvedValueOnce({
        tailoredSummary: "Senior engineer.",
        selectedSkills: ["React", "TypeScript", "Redux"],
        selectedExperienceBullets: [],
        projectSelections: [],
        keywordAlignment: {
          matchedTerms: ["React", "TypeScript", "Redux"],
          method: "test",
        },
        markdownResume,
        plainTextResume: markdownResume.replace(/^#+\s/gm, ""),
        warnings: [],
        unsupportedClaimsDetected: [],
        validation: null,
      })
      .mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_yubico",
          company: "Yubico",
          title: "Senior Software Engineer",
          startDate: "Jul 2022",
          endDate: "Mar 2026",
          skills: ["React", "TypeScript", "Redux", "Jest"],
          createdAt: now,
        }),
      ],
    });

    expect(
      tailored.markdownResume.match(/Skills: React, TypeScript, Redux, Jest/g),
    ).toHaveLength(1);
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
        resumeFormat: "modern_two_column",
        masterSummary: "Senior product engineer.",
        professionalSummary:
          "Senior product engineer building React and TypeScript products.",
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
            applicationSummary:
              "Built sales engagement workflows for enterprise sales teams.",
            users:
              "Sales teams used the platform to manage guided selling workflows.",
            scaleImpact: "Supported enterprise sales operations.",
            confirmedTech: [
              { name: "React", version: "17", source: "user_confirmed" },
            ],
            versionSuggestions: [
              {
                id: "typescript:3.x-4.x",
                name: "TypeScript",
                suggestedVersion: "3.x-4.x",
                confidence: 0.56,
                rationale: "Estimated from role dates.",
                status: "NEEDS_REVIEW",
                source: "date_window",
                evidence: ["TypeScript"],
              },
            ],
          },
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "### Revenue.io - Senior Software Engineer | Mar 2020 - Sep 2022",
    );
    expect(tailored.markdownResume).toContain("Skills: React 17");
    expect(tailored.markdownResume).not.toContain("Tech Used:");
    expect(tailored.markdownResume).not.toContain("TypeScript 3.x-4.x");
    expect(tailored.markdownResume).not.toMatch(
      /likely|estimated|inferred|available at the time/i,
    );
  });

  it("does not carry ambiguous AR fallback skills into unrelated role skill lines", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_1",
          company: "Yubico",
          title: "Senior Software Engineer",
          startDate: "Jul 2022",
          endDate: "Mar 2026",
          skills: ["React", "TypeScript", "AR", "frontend architecture"],
          achievements: [
            "Built enterprise admin console features supporting YubiKey management, provisioning flows, inventory workflows, and device lifecycle management.",
            "Partnered with backend and product teams on API contracts, frontend architecture, rollout planning, and enterprise workflow design.",
          ],
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "Skills: React, TypeScript, frontend architecture",
    );
    expect(tailored.markdownResume).not.toContain(
      "Skills: React, TypeScript, AR",
    );
  });

  it("keeps AR fallback skills when the role evidence supports augmented reality work", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_1",
          company: "Grindr",
          title: "Senior Web Developer / Manager",
          startDate: "Apr 2016",
          endDate: "Aug 2017",
          skills: ["JavaScript", "AR", "analytics"],
          achievements: [
            "Created an augmented reality campaign experience where users triggered animated emoji from physical advertisements.",
          ],
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "Skills: JavaScript, AR, analytics",
    );
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
          description:
            "Local-first AI-powered job search operating system coordinating specialized agents and application workflows.",
          technologies: [
            "Next.js",
            "TypeScript",
            "React",
            "Prisma",
            "PostgreSQL",
          ],
          createdAt: now,
        }),
      ],
      githubRepositories: [
        githubRepository({
          id: "repo_1",
          name: "jobsearch-dashboard-ai",
          fullName: "carlwelchdesign/jobsearch-dashboard-ai",
          htmlUrl: "https://github.com/carlwelchdesign/jobsearch-dashboard-ai",
          description:
            "Local-first AI job search dashboard that discovers and scores roles.",
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

    const promptInput = parseStructuredOutputMock.mock.calls.at(-1)?.[0]
      .input as {
      githubRepositories?: Array<{ name: string }>;
    };
    expect(promptInput.githubRepositories).toEqual([]);
  });

  it("includes selected project technologies in deterministic skills", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["JavaScript"],
      }),
      job: {
        ...jobPosting(now),
        description:
          "Frontend platform role using Next.js, Prisma, PostgreSQL, Redis, Docker, RAG, MCP, LangGraph, and Playwright.",
      },
      bullets: [],
      projects: [
        project({
          id: "project_1",
          name: "Job Search OS",
          description:
            "Local-first AI-powered job search operating system coordinating specialized agents.",
          technologies: [
            "Next.js",
            "TypeScript",
            "React",
            "Prisma",
            "PostgreSQL",
            "pgvector",
            "Redis",
            "Docker",
            "RAG",
            "MCP",
            "Model Context Protocol",
            "LangGraph",
            "Playwright",
            "Server-Sent Events",
            "Material UI",
            "Vitest",
            "guitar",
            "guitarchords",
            "music-theory",
            "music-tools",
          ],
          createdAt: now,
        }),
      ],
      githubRepositories: [],
      workExperiences: [],
    });

    expect(tailored.markdownResume).toContain("Next.js");
    expect(tailored.markdownResume).toContain("Prisma");
    expect(tailored.markdownResume).toContain("PostgreSQL");
    expect(tailored.markdownResume).toContain("LangGraph");
    expect(tailored.selectedSkills).toContain("MCP");
    expect(tailored.selectedSkills).toContain("real-time event streaming");
    expect(tailored.selectedSkills).not.toContain("Model Context Protocol");
    expect(tailored.selectedSkills).not.toEqual(
      expect.arrayContaining(["guitar", "guitarchords", "music-theory", "music-tools"]),
    );
    expect(tailored.markdownResume).toContain(
      "## Skills\nNext.js, Prisma, PostgreSQL, Redis, Docker, RAG, MCP, LangGraph, React, TypeScript, JavaScript, pgvector, Playwright, real-time event streaming, Material UI, Vitest",
    );
  });

  it("keeps Server-Sent Events when the job explicitly asks for it", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["Server-Sent Events"],
      }),
      job: {
        ...jobPosting(now),
        description:
          "Build live application dashboards using Server-Sent Events, EventSource, React, and TypeScript.",
      },
      bullets: [],
      projects: [],
      githubRepositories: [],
      workExperiences: [],
    });

    expect(tailored.selectedSkills).toContain("Server-Sent Events");
    expect(tailored.selectedSkills).not.toContain("real-time event streaming");
  });

  it("keeps music skills for music-related jobs", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        coreSkills: ["React", "TypeScript"],
        technicalSkills: ["guitar", "music-theory", "music-tools"],
      }),
      job: {
        ...jobPosting(now),
        title: "Frontend Engineer, Music Creator Tools",
        description:
          "Build guitar chord learning and music theory workflows for musicians.",
      },
      bullets: [],
      projects: [],
      githubRepositories: [],
      workExperiences: [],
    });

    expect(tailored.selectedSkills).toEqual(
      expect.arrayContaining(["guitar", "music-theory", "music-tools"]),
    );
  });

  it("strips generated summary scaffold language from AI output", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    parseStructuredOutputMock
      .mockResolvedValueOnce({
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
          ...Array.from(
            { length: 18 },
            (_, index) =>
              `- Built verified product workflow ${index + 1} with React, TypeScript, API integration, testing coverage, component architecture, and cross-functional delivery for enterprise users.`,
          ),
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
          ...Array.from(
            { length: 18 },
            (_, index) =>
              `- Built verified product workflow ${index + 1} with React, TypeScript, API integration, testing coverage, component architecture, and cross-functional delivery for enterprise users.`,
          ),
        ].join("\n"),
        warnings: [],
        unsupportedClaimsDetected: [],
        validation: null,
      })
      .mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now, {
        linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/",
      }),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [],
      githubRepositories: [],
    });

    expect(tailored.markdownResume).toContain(
      "Senior engineer building React systems.",
    );
    expect(tailored.markdownResume).toContain(
      "https://www.linkedin.com/in/carlwelchdesign",
    );
    expect(tailored.markdownResume).toContain(
      "https://github.com/carlwelchdesign",
    );
    expect(tailored.markdownResume).not.toContain("Selected strengths for");
    expect(tailored.plainTextResume).not.toContain("Selected strengths for");
  });

  it("promotes verified project stack skills into the AI-generated main Skills section", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const fillerBullets = Array.from(
      { length: 12 },
      (_, index) =>
        `- Built verified product workflow ${index + 1} with React, TypeScript, agent orchestration, workflow automation, data modeling, testing, and cross-functional delivery for high-trust users.`,
    );
    parseStructuredOutputMock.mockResolvedValueOnce({
      tailoredSummary: "Senior engineer.",
      selectedSkills: ["React", "TypeScript"],
      selectedExperienceBullets: [],
      projectSelections: [],
      keywordAlignment: { matchedTerms: ["React"], method: "test" },
      markdownResume: [
        "# Carl Welch",
        "",
        "## Summary",
        "Senior engineer building React and TypeScript product systems for complex workflows.",
        "",
        "## Skills",
        "React, TypeScript",
        "",
        "## Professional Experience",
        ...fillerBullets,
        "",
        "## Projects",
        "- Job Search OS: Local-first AI-powered job search operating system coordinating specialized agents. | Next.js, TypeScript, React, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, Model Context Protocol, LangGraph, LangChain, Playwright, Server-Sent Events, Material UI, Vitest",
      ].join("\n"),
      plainTextResume: [
        "Carl Welch",
        "",
        "Summary",
        "Senior engineer building React and TypeScript product systems for complex workflows.",
        "",
        "Skills",
        "React, TypeScript",
        "",
        "Professional Experience",
        ...fillerBullets,
        "",
        "Projects",
        "Job Search OS: Local-first AI-powered job search operating system coordinating specialized agents. | Next.js, TypeScript, React, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, Model Context Protocol, LangGraph, LangChain, Playwright, Server-Sent Events, Material UI, Vitest",
      ].join("\n"),
      warnings: [],
      unsupportedClaimsDetected: [],
      validation: null,
    });

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [
        project({
          id: "project_1",
          name: "Job Search OS",
          description:
            "Local-first AI-powered job search operating system coordinating specialized agents.",
          technologies: [
            "Next.js",
            "TypeScript",
            "React",
            "Prisma",
            "PostgreSQL",
            "pgvector",
            "Redis",
            "Docker",
            "OpenAI structured outputs",
            "RAG",
            "MCP",
            "Model Context Protocol",
            "LangGraph",
            "LangChain",
            "Playwright",
            "Server-Sent Events",
            "Material UI",
            "Vitest",
          ],
          createdAt: now,
        }),
      ],
      workExperiences: [],
      githubRepositories: [],
    });

    expect(tailored.markdownResume).toContain(
      "## Skills\nReact, TypeScript, Next.js, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, LangGraph, LangChain, Playwright, real-time event streaming, Material UI, Vitest",
    );
    const plainTextSkills = tailored.plainTextResume.match(/Skills\n([\s\S]*?)\nProfessional Experience/)?.[1] ?? "";
    expect(tailored.plainTextResume).toContain("LangGraph");
    expect(tailored.plainTextResume).toContain("real-time event streaming");
    expect(plainTextSkills).not.toContain("Model Context Protocol");
  });

  it("does not append a continuity duplicate when AI output already includes a role alias", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const roleBullets = Array.from(
      { length: 12 },
      (_, index) =>
        `- Built verified public-safety workflow ${index + 1} with JavaScript, evidence review tooling, video playback, GPS mapping, secure case preparation, and cross-functional delivery.`,
    );
    parseStructuredOutputMock
      .mockResolvedValueOnce({
        tailoredSummary: "Senior engineer.",
        selectedSkills: ["JavaScript"],
        selectedExperienceBullets: [],
        projectSelections: [],
        keywordAlignment: { matchedTerms: ["JavaScript"], method: "test" },
        markdownResume: [
          "# Carl Welch",
          "",
          "## Summary",
          "Senior engineer building public-safety and frontend systems with JavaScript, secure workflow tooling, video review interfaces, GPS mapping, and evidence preparation experience.",
          "",
          "## Skills",
          "JavaScript, frontend architecture, video tooling",
          "",
          "## Professional Experience",
          "### TASER International / AXON - Front End Developer | Apr 2009 - Oct 2011",
          ...roleBullets,
        ].join("\n"),
        plainTextResume: [
          "Carl Welch",
          "",
          "Summary",
          "Senior engineer building public-safety and frontend systems with JavaScript, secure workflow tooling, video review interfaces, GPS mapping, and evidence preparation experience.",
          "",
          "Skills",
          "JavaScript, frontend architecture, video tooling",
          "",
          "Professional Experience",
          "TASER International / AXON - Front End Developer | Apr 2009 - Oct 2011",
          ...roleBullets,
        ].join("\n"),
        warnings: [],
        unsupportedClaimsDetected: [],
        validation: null,
      })
      .mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_taser_profile",
          company: "Taser International",
          title: "Front End Developer",
          achievements: [
            "Contributed to early front-end development of Axon's public safety technology platform, including wearable recording device interfaces and Evidence.com.",
          ],
          createdAt: now,
        }),
      ],
      githubRepositories: [],
    });

    expect(tailored.markdownResume).toContain(
      "### TASER International / AXON - Front End Developer | Apr 2009 - Oct 2011",
    );
    expect(tailored.markdownResume).not.toContain(
      "### Taser International - Front End Developer",
    );
  });

  it("deduplicates near-identical VFMED and TACFIRE bullets in generated military experience", async () => {
    const now = new Date("2026-06-04T12:00:00Z");
    const fillerBullets = Array.from(
      { length: 10 },
      (_, index) =>
        `- Delivered verified frontend product workflow ${index + 1} with React, TypeScript, application architecture, test coverage, customer workflows, performance tuning, and cross-functional release execution.`,
    );
    parseStructuredOutputMock
      .mockResolvedValueOnce({
        tailoredSummary: "Senior engineer.",
        selectedSkills: ["React", "TypeScript"],
        selectedExperienceBullets: [],
        projectSelections: [],
        keywordAlignment: { matchedTerms: ["React"], method: "test" },
        markdownResume: [
          "# Carl Welch",
          "",
          "## Summary",
          "Senior engineer building frontend systems with React, TypeScript, operational tooling, communication workflows, and high-trust delivery experience.",
          "",
          "## Skills",
          "React, TypeScript, frontend architecture",
          "",
          "## Professional Experience",
          "### U.S. Army - 13F Fire Support Specialist | 1990 - 1991",
          "- Operated early digital fire support communication tools, including the VFMED device for transmitting targeting data into TACFIRE",
          "- Served as a 13F Fire Support Specialist during Operation Desert Storm, supporting infantry and maneuver units through target identification, fire support coordination, map reading, coordinate calculation, and communication with Tactical Operations Centers.",
          "- Worked with early digital fire support communication tools including the VFMED, a rugged field-portable device used to transmit targeting data into TACFIRE.",
          "- Acted as liaison between U.S. troops and foreign allied forces to coordinate communication and operational alignment in a high-pressure environment",
          "",
          "### CurrentCo - Senior Engineer | 2022 - Present",
          ...fillerBullets,
        ].join("\n"),
        plainTextResume: [
          "Carl Welch",
          "",
          "Summary",
          "Senior engineer building frontend systems with React, TypeScript, operational tooling, communication workflows, and high-trust delivery experience.",
          "",
          "Skills",
          "React, TypeScript, frontend architecture",
          "",
          "Professional Experience",
          "U.S. Army - 13F Fire Support Specialist | 1990 - 1991",
          "- Operated early digital fire support communication tools, including the VFMED device for transmitting targeting data into TACFIRE",
          "- Served as a 13F Fire Support Specialist during Operation Desert Storm, supporting infantry and maneuver units through target identification, fire support coordination, map reading, coordinate calculation, and communication with Tactical Operations Centers.",
          "- Worked with early digital fire support communication tools including the VFMED, a rugged field-portable device used to transmit targeting data into TACFIRE.",
          "- Acted as liaison between U.S. troops and foreign allied forces to coordinate communication and operational alignment in a high-pressure environment",
          "CurrentCo - Senior Engineer | 2022 - Present",
          ...fillerBullets,
        ].join("\n"),
        warnings: [],
        unsupportedClaimsDetected: [],
        validation: null,
      })
      .mockResolvedValueOnce(null);

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_army",
          company: "U.S. Army",
          title: "13F Fire Support Specialist",
          startDate: "1990",
          endDate: "1991",
          createdAt: now,
        }),
      ],
      githubRepositories: [],
    });

    expect(tailored.markdownResume.match(/VFMED/g)?.length).toBe(1);
    expect(tailored.markdownResume.match(/TACFIRE/g)?.length).toBe(1);
    expect(tailored.markdownResume).toContain("Served as a 13F Fire Support Specialist during Operation Desert Storm");
    expect(tailored.markdownResume).toContain("Acted as liaison between U.S. troops and foreign allied forces");
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

    expect(
      tailored.markdownResume.split("\n").slice(0, 3).join("\n"),
    ).toContain("https://www.linkedin.com/in/carlwelchdesign");
    expect(
      tailored.markdownResume.split("\n").slice(0, 3).join("\n"),
    ).toContain("https://github.com/carlwelchdesign");
  });

  it("prefers approved quantified achievements in fallback role bullets", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [
        experienceBullet({
          id: "bullet_generic",
          company: "Yubico",
          role: "Senior Software Engineer",
          text: "Built enterprise admin console features supporting YubiKey management and provisioning workflows.",
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_yubico",
          company: "Yubico",
          title: "Senior Software Engineer",
          startDate: "2022",
          endDate: "2026",
          achievements: [
            "Built enterprise admin console features supporting YubiKey management and provisioning workflows.",
            "Increased test automation by 50% using Jest and Playwright while reducing QA time, regressions, support issues, and release risk.",
          ],
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "Increased test automation by 50%",
    );
    expect(
      tailored.markdownResume.indexOf("Increased test automation by 50%"),
    ).toBeLessThan(
      tailored.markdownResume.indexOf(
        "Built enterprise admin console features",
      ),
    );
  });

  it("merges TASER and AXON role aliases into the dated upload role", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [
        experienceBullet({
          id: "bullet_taser_profile",
          company: "Taser International",
          role: "Front End Developer",
          text: "Contributed to early front-end development of Axon's public safety technology platform, including wearable recording device interfaces and Evidence.com.",
          workExperienceId: "work_taser_profile",
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_taser_upload",
          company: "TASER International / AXON",
          title: "Front End Developer",
          startDate: "Apr 2009",
          endDate: "Oct 2011",
          achievements: [
            "Built AXON officer dashboard features for body-camera video review, GPS/map playback, evidence annotation, case preparation, secure packaging, and video tooling.",
          ],
          createdAt: now,
        }),
        workExperience({
          id: "work_taser_profile",
          company: "Taser International",
          title: "Front End Developer",
          achievements: [
            "Contributed to early front-end development of Axon's public safety technology platform, including wearable recording device interfaces and Evidence.com.",
          ],
          createdAt: new Date("2026-05-01T12:00:00Z"),
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "### TASER International / AXON - Front End Developer | Apr 2009 - Oct 2011",
    );
    expect(tailored.markdownResume).toContain(
      "Contributed to early front-end development of Axon's public safety technology platform",
    );
    expect(tailored.markdownResume).toContain(
      [
        "### TASER International / AXON - Front End Developer | Apr 2009 - Oct 2011",
        "- Contributed to early front-end development of Axon's public safety technology platform, including wearable recording device interfaces and Evidence.com.",
      ].join("\n"),
    );
    expect(tailored.markdownResume).not.toContain(
      "### Taser International - Front End Developer",
    );
  });

  it("merges no-date General Dynamics R&D evidence into the dated canonical role", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [
        experienceBullet({
          id: "bullet_gd_rd",
          company: "General Dynamics Land Systems",
          role: "Manager / Lead Developer of R&D: VR & AR Applications",
          text: "Received over $300K in funding from General Motors Defense Systems for VR and AR R&D projects.",
          workExperienceId: "work_gd_rd",
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_gd_upload",
          company: "General Dynamics Land Systems",
          title: "Manager / Lead Developer",
          startDate: "2001",
          endDate: "2004",
          achievements: [
            "Directed VR/AR training and maintenance simulation programs for Stryker combat vehicle scenarios.",
          ],
          createdAt: now,
        }),
        workExperience({
          id: "work_gd_rd",
          company: "General Dynamics Land Systems",
          title: "Manager / Lead Developer of R&D: VR & AR Applications",
          achievements: [
            "Received over $300K in funding from General Motors Defense Systems.",
          ],
          createdAt: new Date("2026-05-01T12:00:00Z"),
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "### General Dynamics Land Systems - Manager / Lead Developer | 2001 - 2004",
    );
    expect(tailored.markdownResume).toContain(
      "Received over $300K in funding",
    );
    expect(tailored.markdownResume).not.toContain(
      "### General Dynamics Land Systems - Manager / Lead Developer of R&D: VR & AR Applications",
    );
  });

  it("keeps distinct same-company roles when both have different date ranges", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const tailored = await tailorResumeForJob({
      userProfile: userProfile(now),
      job: jobPosting(now),
      bullets: [],
      projects: [],
      workExperiences: [
        workExperience({
          id: "work_acme_early",
          company: "Acme",
          title: "Frontend Engineer",
          startDate: "2010",
          endDate: "2012",
          summary: "Built early customer-facing web applications.",
          createdAt: new Date("2012-01-01T12:00:00Z"),
        }),
        workExperience({
          id: "work_acme_later",
          company: "Acme",
          title: "Frontend Engineer",
          startDate: "2018",
          endDate: "2020",
          summary: "Led modern React dashboard development.",
          createdAt: now,
        }),
      ],
    });

    expect(tailored.markdownResume).toContain(
      "### Acme - Frontend Engineer | 2018 - 2020",
    );
    expect(tailored.markdownResume).toContain(
      "### Acme - Frontend Engineer | 2010 - 2012",
    );
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

describe("generateCoverLetterForJob", () => {
  it("uses a blocked placeholder instead of a fake recruiter-facing fallback letter", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);
    const now = new Date("2026-06-04T12:00:00Z");

    const draft = await generateCoverLetterForJob({
      userProfile: userProfile(now),
      job: {
        ...jobPosting(now),
        company:
          "Senior Software Engineer - Frontend/React (USA Only - 100% Remote) @ Close",
        title:
          "Senior Software Engineer - Frontend/React (USA Only - 100% Remote)",
        description: "React frontend architecture developer experience.",
      },
      bullets: [
        experienceBullet({
          id: "bullet_ar",
          company: "Hughes",
          role: "Program Manager",
          text: "Received over $300K in funding from General Motors Defense Systems for VR and AR R&D projects.",
          createdAt: now,
        }),
        experienceBullet({
          id: "bullet_frontend",
          company: "Yubico",
          role: "Senior Software Engineer",
          text: "Built React admin console workflows and frontend architecture for enterprise identity teams.",
          createdAt: now,
        }),
      ],
      projects: [],
      workExperiences: [],
      githubRepositories: [],
    });

    expect(draft.generatedBy).toBe("deterministic_fallback");
    expect(draft.body).toContain("Cover letter generation needs review");
    expect(draft.body).toContain(
      "Close's Senior Software Engineer - Frontend/React (USA Only - 100% Remote) role",
    );
    expect(draft.body).not.toContain("@ Close role");
    expect(draft.body).toContain(
      "Regenerate the cover letter before using this application packet.",
    );
    expect(draft.body).not.toContain("Dear Senior Software Engineer");
    expect(draft.body).not.toContain(
      "maps to my strongest verified experience",
    );
    expect(draft.body).not.toContain("Received over $300K");
    expect(draft.body).not.toMatch(/^- /m);
    expect(draft.warnings).toContain(
      "Structured cover-letter generation was unavailable; regenerate before using this application packet.",
    );
    expect(parseStructuredOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "generate_cover_letter",
        input: expect.objectContaining({
          company: "Close",
          job: expect.objectContaining({
            title:
              "Senior Software Engineer - Frontend/React (USA Only - 100% Remote)",
          }),
        }),
      }),
    );
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
    resumeFormat: "modern_two_column",
    masterSummary: "Senior product engineer.",
    professionalSummary:
      "Senior product engineer building React and TypeScript products.",
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

function generatedResumeWithoutRoleSkills(experienceLines: string[]) {
  return [
    "# Carl Welch",
    "carl@example.com | https://github.com/carlwelchdesign",
    "",
    "## Summary",
    "Senior software engineer building React, TypeScript, and product workflow systems for enterprise teams.",
    "Experienced frontend platform engineer with strong delivery, testing, architecture, and cross-functional leadership experience.",
    "",
    "## Skills",
    "React, TypeScript, Redux, Node.js, Jest, Playwright, frontend architecture",
    "",
    "## Professional Experience",
    ...experienceLines,
  ].join("\n");
}

function longResumeBullets(prefix: string) {
  return Array.from(
    { length: 5 },
    (_, index) =>
      `- ${prefix} ${index + 1} with React, TypeScript, state management, API integrations, test automation, release planning, component architecture, analytics workflows, cross-functional coordination, and measurable delivery improvements for enterprise users.`,
  );
}

function experienceBullet(
  input: Partial<ExperienceBullet> &
    Pick<ExperienceBullet, "id" | "company" | "role" | "text" | "createdAt">,
): ExperienceBullet {
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

function workExperience(
  input: Partial<WorkExperience> &
    Pick<WorkExperience, "id" | "company" | "title" | "createdAt">,
): WorkExperience {
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

function project(
  input: Partial<Project> & Pick<Project, "id" | "name" | "createdAt">,
): Project {
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

function githubRepository(
  input: Partial<GithubRepository> &
    Pick<
      GithubRepository,
      "id" | "name" | "fullName" | "htmlUrl" | "createdAt"
    >,
): GithubRepository {
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
