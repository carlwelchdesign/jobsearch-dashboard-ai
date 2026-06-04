import { describe, expect, it, vi } from "vitest";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { tailorResumeForJob } from "./resume";
import type { ExperienceBullet, JobPosting, UserProfile, WorkExperience } from "@prisma/client";

vi.mock("@/lib/ai/openai", () => ({
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
    expect(tailored.markdownResume).toContain("### EarlierCo - Frontend Engineer | 2018 - 2021");
    expect(tailored.markdownResume).toContain("- Built and maintained customer-facing web applications.");
  });
});

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
    sourceResumeUploadId: null,
    updatedAt: input.createdAt,
    ...input,
  };
}
