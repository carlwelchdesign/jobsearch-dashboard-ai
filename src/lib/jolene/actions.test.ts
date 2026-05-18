import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncJobResponseEmail } from "@/lib/email/sync";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { executeJoleneAction } from "@/lib/jolene/actions";

vi.mock("@/lib/email/sync", () => ({
  syncJobResponseEmail: vi.fn(),
}));

vi.mock("@/lib/job-search/start-run", () => ({
  startJobSearchRun: vi.fn(),
}));

vi.mock("@/lib/agents/duplicate-stale-job-detector", () => ({
  runDuplicateStaleJobDetectorAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedCoverLetter: { findMany: vi.fn() },
    candidateEvidence: { findMany: vi.fn() },
    experienceBullet: { findMany: vi.fn() },
    application: { findMany: vi.fn() },
    jobPosting: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    workExperience: { findMany: vi.fn() },
  },
}));

const syncJobResponseEmailMock = vi.mocked(syncJobResponseEmail);
const startJobSearchRunMock = vi.mocked(startJobSearchRun);

describe("executeJoleneAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.generatedCoverLetter.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.candidateEvidence.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.experienceBullet.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.application.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPosting.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.workExperience.findMany).mockResolvedValue([] as never);
  });

  it("checks email when the user asks Jolene to check Gmail", async () => {
    syncJobResponseEmailMock.mockResolvedValue({
      ok: true,
      scanned: 3,
      ingested: 2,
      skipped: 1,
      receivedConfirmations: [
        {
          applicationId: "app_1",
          company: "Acme",
          title: "Frontend Engineer",
          subject: "Thanks for applying",
          from: "talent@acme.example",
          receivedAt: new Date("2026-05-15T12:30:00.000Z"),
        },
      ],
      watchlist: [{
        applicationId: "app_1",
        company: "Acme",
        title: "Frontend Engineer",
        applicationUrl: null,
        appliedAt: new Date("2026-05-15T12:00:00.000Z"),
        updatedAt: new Date("2026-05-15T12:00:00.000Z"),
        gmailQueries: ["\"Acme\" newer_than:7d"],
      }],
      providers: [
        {
          ok: true,
          provider: "gmail",
          scanned: 3,
          ingested: 2,
          skipped: 1,
          queries: ["\"Acme\" newer_than:7d"],
          messages: [],
        },
      ],
    });

    const result = await executeJoleneAction("check my gmail for responses");

    expect(syncJobResponseEmailMock).toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("against 1 active application");
    expect(result.reply).toContain("Application receipts recorded for: Acme");
    expect(result.actionJson).toMatchObject({ action: "check_email", scanned: 3, ingested: 2, watchedApplications: 1 });
    expect(result.clientAction).toEqual({ type: "navigate", href: "/applications", refresh: true });
  });

  it("still starts job search requests", async () => {
    startJobSearchRunMock.mockResolvedValue({
      started: true,
      skipped: false,
      reason: null,
      run: { id: "run_1" },
    } as never);

    const result = await executeJoleneAction("run a new search");

    expect(startJobSearchRunMock).toHaveBeenCalledWith("manual");
    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "run_job_search", runId: "run_1" });
  });

  it("finds a generated cover letter by company", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.generatedCoverLetter.findMany).mockResolvedValue([
      {
        id: "letter_1",
        userId: "user_1",
        jobPostingId: "job_1",
        jobProfileMatchId: "match_1",
        body: "Cover letter body",
        version: 1,
        generationNotes: {},
        createdAt: new Date("2026-05-15T12:00:00.000Z"),
        updatedAt: new Date("2026-05-15T12:30:00.000Z"),
        jobPosting: { id: "job_1", company: "Linear", title: "Senior / Staff Fullstack Engineer" },
        applications: [{ id: "app_1", status: "applied" }],
      },
    ] as never);
    vi.mocked(prisma.application.findMany).mockResolvedValue([] as never);

    const result = await executeJoleneAction("Where is the cover letter for Linear?", { userId: "user_1" });

    expect(prisma.generatedCoverLetter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user_1" } }));
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Cover letter for Linear");
    expect(result.actionJson).toMatchObject({
      action: "find_cover_letter",
      query: "Linear",
      resultCount: 1,
      resultLinks: expect.arrayContaining([
        expect.objectContaining({ label: "Text", href: "/api/cover-letters/letter_1/plain-text" }),
        expect.objectContaining({ label: "Application", href: "/applications/app_1" }),
      ]),
    });
  });

  it("lists related records when a cover letter is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.generatedCoverLetter.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.application.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "app_2",
          status: "ready_to_apply",
          updatedAt: new Date("2026-05-16T12:00:00.000Z"),
          jobPosting: { id: "job_2", company: "Terzo", title: "Frontend Engineer" },
        },
      ] as never);
    vi.mocked(prisma.jobPosting.findMany).mockResolvedValue([
      { id: "job_2", company: "Terzo", title: "Frontend Engineer", updatedAt: new Date("2026-05-16T12:00:00.000Z") },
    ] as never);

    const result = await executeJoleneAction("Find my cover letter for Terzo", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.reply).toContain("did not find a generated cover letter");
    expect(result.actionJson?.resultLinks).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/applications/app_2" })]));
  });

  it("returns candidate links for application material lookups", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.generatedCoverLetter.findMany).mockResolvedValue([
      {
        id: "letter_3",
        userId: "user_1",
        jobPostingId: "job_3",
        jobProfileMatchId: "match_3",
        body: "Cover letter body",
        version: 1,
        generationNotes: {},
        createdAt: new Date("2026-05-15T12:00:00.000Z"),
        updatedAt: new Date("2026-05-15T12:30:00.000Z"),
        jobPosting: { id: "job_3", company: "Terzo", title: "Frontend Engineer" },
        applications: [{ id: "app_3", status: "ready_to_apply" }],
      },
    ] as never);
    vi.mocked(prisma.application.findMany).mockResolvedValue([] as never);

    const result = await executeJoleneAction("Show me application materials for Terzo", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "find_application_materials", resultCount: 1 });
    expect(result.actionJson?.resultLinks).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/resumes/generated" })]));
  });

  it("does not treat pasted interview guidance as an email sync command", async () => {
    await mockCareerContext();

    const result = await executeJoleneAction(`
      I landed an interview with a company called Socure. They sent an email that says this:
      As you plan for your interview, I wanted to share a bit more about the success profiles that we are evaluating for at Socure.
      We look for people who take ownership, have had real-world impact, and thrive working in fast-moving, often ambiguous start-up environments.
      During interviews, it is helpful to come prepared to discuss high-visibility projects you owned end-to-end, specific metrics quantifying how your work impacted customers or the business, hard-to-solve unclear problems, decision-making trade-offs, and how you are using AI in your workflows to maximize impact and efficiency.
      How have you observed this applies to me?
    `, { userId: "user_1" });

    expect(syncJobResponseEmailMock).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "interview_coaching" });
    expect(result.reply).toContain("Socure");
    expect(result.reply).toContain("Interview-ready talking points");
    expect(result.reply).toContain("AI");
  });

  it("answers direct career story requests from local context", async () => {
    await mockCareerContext();

    const result = await executeJoleneAction("Give me stories for ownership, ambiguity, metrics, and AI workflows.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "interview_coaching" });
    expect(result.reply).toContain("ownership");
    expect(result.reply).toContain("Metrics to prepare");
  });
});

async function mockCareerContext() {
  const { prisma } = await import("@/lib/prisma");
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user_1",
    profile: {
      id: "profile_1",
      fullName: "Carl Welch",
      yearsExperience: 20,
      professionalSummary: "Senior full-stack engineer building AI workflow products.",
      masterSummary: "Full-stack product engineer.",
      primaryRoles: ["Senior Software Engineer", "Frontend Platform Lead"],
      coreSkills: ["React", "TypeScript", "AI workflows"],
      technicalSkills: ["Next.js", "Postgres", "LangGraph", "RAG"],
      industries: ["SaaS", "AI"],
      domainExpertise: ["agentic workflows", "design systems"],
    },
  } as never);
  vi.mocked(prisma.candidateEvidence.findMany).mockResolvedValue([
    {
      id: "ev_ownership",
      title: "Owned AI job search operating system end to end",
      content: "Built a full-stack agentic workflow system with Next.js, Prisma, LangGraph, RAG evidence, application automation, and quality loops.",
      tags: ["ownership", "ai", "langgraph", "full-stack"],
      sourceType: "USER_INPUT",
    },
    {
      id: "ev_impact",
      title: "Interview outcome from job search system",
      content: "The workflow helped land interviews and reduced repeated manual application work through prepared packets and dedupe.",
      tags: ["impact", "metrics", "interview"],
      sourceType: "APPLICATION_HISTORY",
    },
  ] as never);
  vi.mocked(prisma.workExperience.findMany).mockResolvedValue([
    {
      company: "ProgressionLab",
      title: "Founder and Lead Engineer",
      summary: "Owned AI SaaS architecture and launch.",
      achievements: ["Built product end-to-end", "Designed secure subscription system"],
      skills: ["React", "TypeScript", "AI"],
    },
  ] as never);
  vi.mocked(prisma.project.findMany).mockResolvedValue([
    {
      name: "Agentic application system",
      description: "AI workflow platform for job search operations.",
      technologies: ["Next.js", "LangGraph", "Postgres"],
      highlights: ["Human-in-the-loop automation", "Quality scoring", "App-aware assistant"],
    },
  ] as never);
  vi.mocked(prisma.experienceBullet.findMany).mockResolvedValue([
    {
      id: "bullet_1",
      role: "Founder",
      company: "ProgressionLab",
      text: "Owned ambiguous AI workflow problems and built reliable product systems with clear trade-offs.",
      category: "ai",
    },
  ] as never);
  vi.mocked(prisma.application.findMany).mockResolvedValue([
    {
      status: "interviewing",
      appliedAt: new Date("2026-05-18T12:00:00.000Z"),
      jobPosting: { company: "Socure", title: "Senior Software Engineer" },
    },
  ] as never);
}
