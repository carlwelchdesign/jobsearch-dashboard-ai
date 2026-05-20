import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { tailorResumeForJob } from "@/lib/ai/resume";
import { attachResumeQa, createResumeStrategy } from "@/lib/applications/material-agents";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import { captureManualJob } from "@/lib/jobs/manual-capture";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";
import { generateCustomOpportunityResume, inferCustomOpportunityDetails } from "./custom-opportunity";

vi.mock("@/lib/agents/job-fit-scorer", () => ({
  runJobFitScoringAgent: vi.fn(),
}));

vi.mock("@/lib/ai/openai", () => ({
  parseStructuredOutput: vi.fn(),
}));

vi.mock("@/lib/ai/resume", () => ({
  tailorResumeForJob: vi.fn(),
}));

vi.mock("@/lib/applications/material-agents", () => ({
  attachResumeQa: vi.fn(),
  createResumeStrategy: vi.fn(),
}));

vi.mock("@/lib/job-search/scoring", () => ({
  scoreJobForProfile: vi.fn(),
}));

vi.mock("@/lib/jobs/manual-capture", () => ({
  captureManualJob: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedResume: { create: vi.fn(), update: vi.fn() },
    jobPosting: { findUnique: vi.fn() },
    jobProfileMatch: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    jobSearchProfile: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/resumes/ats", () => ({
  checkAtsReadability: vi.fn(),
}));

const parseMock = vi.mocked(parseStructuredOutput);
const captureManualJobMock = vi.mocked(captureManualJob);
const runJobFitScoringAgentMock = vi.mocked(runJobFitScoringAgent);
const scoreJobForProfileMock = vi.mocked(scoreJobForProfile);
const tailorResumeForJobMock = vi.mocked(tailorResumeForJob);
const createResumeStrategyMock = vi.mocked(createResumeStrategy);
const attachResumeQaMock = vi.mocked(attachResumeQa);
const checkAtsReadabilityMock = vi.mocked(checkAtsReadability);

describe("custom opportunity resumes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseMock.mockResolvedValue(null);
    createResumeStrategyMock.mockResolvedValue(null);
    attachResumeQaMock.mockImplementation(async ({ resume }) => ({ qa: null, notes: resume.generationNotes ?? {} }) as Awaited<ReturnType<typeof attachResumeQa>>);
    checkAtsReadabilityMock.mockReturnValue({
      score: 96,
      warnings: [],
      textExtractable: true,
      contactInfoDetected: true,
      sectionsDetected: ["Summary", "Skills"],
      missingSections: [],
      extractedTextLength: 1200,
    });
  });

  it("infers details heuristically when structured output is unavailable", async () => {
    const details = await inferCustomOpportunityDetails(
      "Role: Senior Frontend Engineer\nCompany: Acme\nLocation: Remote US\nBuild React and TypeScript interfaces.",
    );

    expect(details).toMatchObject({
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote US",
      remoteType: "remote",
    });
  });

  it("scores the best enabled profile when capture creates no match", async () => {
    const job = {
      id: "job_1",
      company: "Acme",
      title: "Senior Frontend Engineer",
      description: "React TypeScript product engineering role.",
      location: "Remote",
    };
    const match = { id: "match_1", jobPostingId: "job_1", jobSearchProfileId: "profile_2", overallScore: 88 };
    const resume = {
      id: "resume_1",
      userId: "user_1",
      jobPostingId: "job_1",
      jobProfileMatchId: "match_1",
      markdown: "# Carl",
      plainText: "Carl\nGenerated resume body.",
      generationNotes: { warnings: [] },
    };
    captureManualJobMock.mockResolvedValue({ job, matches: [], created: true } as unknown as Awaited<ReturnType<typeof captureManualJob>>);
    vi.mocked(prisma.jobProfileMatch.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.jobSearchProfile.findMany).mockResolvedValue([
      { id: "profile_1", name: "Low", enabled: true },
      { id: "profile_2", name: "High", enabled: true },
    ] as Awaited<ReturnType<typeof prisma.jobSearchProfile.findMany>>);
    scoreJobForProfileMock
      .mockReturnValueOnce({ overallScore: 40 } as ReturnType<typeof scoreJobForProfile>)
      .mockReturnValueOnce({ overallScore: 88 } as ReturnType<typeof scoreJobForProfile>);
    runJobFitScoringAgentMock.mockResolvedValue({ output: { evaluationId: "eval_1" } } as Awaited<ReturnType<typeof runJobFitScoringAgent>>);
    vi.mocked(prisma.jobProfileMatch.findUnique).mockResolvedValue(match as Awaited<ReturnType<typeof prisma.jobProfileMatch.findUnique>>);
    vi.mocked(prisma.jobPosting.findUnique).mockResolvedValue(job as Awaited<ReturnType<typeof prisma.jobPosting.findUnique>>);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user_1",
      profile: {
        experienceBullets: [],
        projects: [],
        githubRepositories: [],
        resumeUploads: [],
        workExperiences: [],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    tailorResumeForJobMock.mockResolvedValue({
      tailoredSummary: "Tailored summary.",
      selectedSkills: [],
      markdownResume: "# Carl\nGenerated resume body.",
      plainTextResume: "Carl\nGenerated resume body.",
      selectedExperienceBullets: [],
      projectSelections: [],
      keywordAlignment: {},
      warnings: [],
      unsupportedClaimsDetected: [],
      validation: null,
      generatedBy: "deterministic_fallback",
    } as unknown as Awaited<ReturnType<typeof tailorResumeForJob>>);
    vi.mocked(prisma.generatedResume.create).mockResolvedValue(resume as unknown as Awaited<ReturnType<typeof prisma.generatedResume.create>>);
    vi.mocked(prisma.generatedResume.update).mockResolvedValue(resume as unknown as Awaited<ReturnType<typeof prisma.generatedResume.update>>);
    vi.mocked(prisma.jobProfileMatch.update).mockResolvedValue(match as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);

    const result = await generateCustomOpportunityResume({
      description: "Recruiter note for a Senior Frontend Engineer role at Acme focused on React and TypeScript.",
      company: "Acme",
      title: "Senior Frontend Engineer",
      remoteType: "remote",
    });

    expect(runJobFitScoringAgentMock).toHaveBeenCalledWith({
      jobPostingId: "job_1",
      jobSearchProfileId: "profile_2",
    });
    expect(result).toMatchObject({
      resumeId: "resume_1",
      jobUrl: "/jobs/job_1",
      pdfUrl: "/api/resumes/generated/resume_1/pdf",
      textUrl: "/api/resumes/generated/resume_1/plain-text",
    });
  });
});
