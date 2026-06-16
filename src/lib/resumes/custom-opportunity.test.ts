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

vi.mock("@/lib/trust/material-claims", () => ({
  syncMaterialClaimsForResume: vi.fn(),
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
      "Sr. Integration Engineer Needed ASAP\nCompany: Acme\nLocation: Remote US\nSet up and implement Model Context Protocol integrations.",
    );

    expect(details).toMatchObject({
      company: "Acme",
      title: "Sr. Integration Engineer",
      location: "Remote US",
      remoteType: "remote",
    });
  });

  it("emphasizes supported app stack for MCP integration briefs without claiming unsupported systems", async () => {
    const job = {
      id: "job_1",
      company: "Prosum Client",
      title: "Sr. Integration Engineer",
      description: "Set up and implement Model Context Protocol (MCP). Integrate with Salesforce, Gong, Snowflake, and legal workflow systems.",
      location: "Austin or Carpinteria",
    };
    const match = { id: "match_1", jobPostingId: "job_1", jobSearchProfileId: "profile_1", overallScore: 84 };
    const resume = {
      id: "resume_1",
      userId: "user_1",
      jobPostingId: "job_1",
      jobProfileMatchId: "match_1",
      markdown: "# Carl",
      plainText: "Carl\nGenerated resume body.",
      generationNotes: { warnings: [] },
    };
    captureManualJobMock.mockResolvedValue({ job, matches: [match], created: true } as unknown as Awaited<ReturnType<typeof captureManualJob>>);
    vi.mocked(prisma.jobProfileMatch.findFirst).mockResolvedValue(match as Awaited<ReturnType<typeof prisma.jobProfileMatch.findFirst>>);
    vi.mocked(prisma.jobPosting.findUnique).mockResolvedValue(job as Awaited<ReturnType<typeof prisma.jobPosting.findUnique>>);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user_1",
      profile: {
        masterSummary: "Product engineer.",
        professionalSummary: "Product engineer.",
        coreSkills: ["React", "TypeScript", "Next.js"],
        technicalSkills: ["Prisma", "Postgres", "pgvector", "LangGraph"],
        experienceBullets: [],
        projects: [{
          name: "Job Search OS",
          description: "Agentic job search assistant with Model Context Protocol (MCP), RAG, LangSmith-style observability, browser automation, email outcome tracking, and application state reconciliation.",
          technologies: ["Next.js", "React", "TypeScript", "Prisma", "Postgres", "pgvector", "LangGraph"],
          highlights: [],
        }],
        githubRepositories: [],
        resumeUploads: [],
        workExperiences: [],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    tailorResumeForJobMock.mockResolvedValue({
      tailoredSummary: "Tailored summary.",
      selectedSkills: [],
      markdownResume: [
        "# Carl Welch",
        "",
        "## Summary",
        "Senior product engineer.",
        "",
        "## Skills",
        "React, TypeScript",
        "",
        "## Professional Experience",
        "- Built product systems.",
      ].join("\n"),
      plainTextResume: [
        "Carl Welch",
        "",
        "Summary",
        "Senior product engineer.",
        "",
        "Skills",
        "React, TypeScript",
        "",
        "Professional Experience",
        "- Built product systems.",
      ].join("\n"),
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

    await generateCustomOpportunityResume({
      description: job.description,
      company: job.company,
      title: job.title,
      location: job.location,
      remoteType: "hybrid",
    });

    const createCall = vi.mocked(prisma.generatedResume.create).mock.calls[0]?.[0];
    expect(createCall?.data.plainText).toContain("Model Context Protocol (MCP)");
    expect(createCall?.data.plainText).toContain("LangGraph");
    expect(createCall?.data.plainText).not.toMatch(/\bSalesforce\b/);
    expect(createCall?.data.plainText).not.toMatch(/\bSnowflake\b/);
    expect(createCall?.data.generationNotes).toMatchObject({
      customOpportunityEmphasis: {
        supportedStackTerms: expect.arrayContaining(["Model Context Protocol (MCP)", "LangGraph"]),
        unsupportedRequestedSystems: expect.arrayContaining(["Salesforce", "Snowflake"]),
      },
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

  it("includes verified user-added bullets even when latest resume upload has enough parsed bullets", async () => {
    const job = {
      id: "job_1",
      company: "Prosum Client",
      title: "Sr. Integration Engineer",
      description: "Set up and implement Model Context Protocol and integrate Salesforce systems.",
      location: "Austin",
    };
    const match = { id: "match_1", jobPostingId: "job_1", jobSearchProfileId: "profile_1", overallScore: 84 };
    const uploadBullets = Array.from({ length: 8 }, (_, index) => ({
      id: `upload_bullet_${index}`,
      text: `Uploaded parsed bullet ${index}`,
      sourceResumeUploadId: "upload_1",
    }));
    const manualRevenueBullet = {
      id: "manual_revenue_salesforce",
      text: "Handled and developed Salesforce integrations for Revenue.io, a Salesforce-native revenue orchestration platform.",
      sourceResumeUploadId: null,
    };
    captureManualJobMock.mockResolvedValue({ job, matches: [match], created: true } as unknown as Awaited<ReturnType<typeof captureManualJob>>);
    vi.mocked(prisma.jobProfileMatch.findFirst).mockResolvedValue(match as Awaited<ReturnType<typeof prisma.jobProfileMatch.findFirst>>);
    vi.mocked(prisma.jobPosting.findUnique).mockResolvedValue(job as Awaited<ReturnType<typeof prisma.jobPosting.findUnique>>);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user_1",
      profile: {
        masterSummary: "Product engineer.",
        professionalSummary: "Product engineer.",
        coreSkills: [],
        technicalSkills: [],
        experienceBullets: [...uploadBullets, manualRevenueBullet],
        projects: [],
        githubRepositories: [],
        resumeUploads: [{ id: "upload_1", parsedJson: {} }],
        workExperiences: [{ id: "work_1", company: "Revenue.io", title: "Senior Software Engineer", sourceResumeUploadId: null }],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    tailorResumeForJobMock.mockResolvedValue({
      tailoredSummary: "Tailored summary.",
      selectedSkills: [],
      markdownResume: "# Carl\n\n## Summary\nSenior engineer.\n\n## Skills\nReact\n\n## Professional Experience\n- Built systems.",
      plainTextResume: "Carl\n\nSummary\nSenior engineer.\n\nSkills\nReact\n\nProfessional Experience\n- Built systems.",
      selectedExperienceBullets: [],
      projectSelections: [],
      keywordAlignment: {},
      warnings: [],
      unsupportedClaimsDetected: [],
      validation: null,
      generatedBy: "deterministic_fallback",
    } as unknown as Awaited<ReturnType<typeof tailorResumeForJob>>);
    vi.mocked(prisma.generatedResume.create).mockResolvedValue({
      id: "resume_1",
      plainText: "Generated",
      markdown: "Generated",
      generationNotes: {},
    } as unknown as Awaited<ReturnType<typeof prisma.generatedResume.create>>);
    vi.mocked(prisma.generatedResume.update).mockResolvedValue({
      id: "resume_1",
      plainText: "Generated",
      markdown: "Generated",
      generationNotes: {},
    } as unknown as Awaited<ReturnType<typeof prisma.generatedResume.update>>);
    vi.mocked(prisma.jobProfileMatch.update).mockResolvedValue(match as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);

    await generateCustomOpportunityResume({
      description: job.description,
      company: job.company,
      title: job.title,
      remoteType: "hybrid",
    });

    expect(tailorResumeForJobMock).toHaveBeenCalledWith(expect.objectContaining({
      bullets: expect.arrayContaining([
        expect.objectContaining({ id: "manual_revenue_salesforce" }),
      ]),
      workExperiences: expect.arrayContaining([
        expect.objectContaining({ company: "Revenue.io" }),
      ]),
    }));
  });
});
