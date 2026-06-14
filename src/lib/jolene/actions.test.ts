import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyCommandCenterAgent } from "@/lib/agents/daily-command-center";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { executeJoleneAction } from "@/lib/jolene/actions";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";

vi.mock("@/lib/agents/daily-command-center", () => ({
  runDailyCommandCenterAgent: vi.fn(),
}));

vi.mock("@/lib/agents/market-intelligence", () => ({
  runMarketIntelligenceAgent: vi.fn(),
}));

vi.mock("@/lib/jolene/email-ops", () => ({
  runJoleneEmailOperationsAgent: vi.fn(),
  getLatestEmailOpsSummary: vi.fn(() => Promise.resolve(null)),
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
    application: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    applicationAnswerMemory: { findMany: vi.fn(), update: vi.fn() },
    applicationOutcome: { findMany: vi.fn(), groupBy: vi.fn() },
    applicationPacket: { count: vi.fn() },
    agentRun: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    agentRunEvent: { create: vi.fn() },
    agentUserRequest: { count: vi.fn(), findMany: vi.fn() },
    careerMission: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    careerSprintSnapshot: { create: vi.fn(), findFirst: vi.fn() },
    jobProfileMatch: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    jobPosting: { findMany: vi.fn(), groupBy: vi.fn() },
    jobSearchProfile: { findMany: vi.fn() },
    jobSearchRun: { findFirst: vi.fn() },
    jobSuppression: { count: vi.fn() },
    linkedInPostDraft: { findFirst: vi.fn() },
    project: { findMany: vi.fn() },
    skillFeedback: { count: vi.fn(), findMany: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    workExperience: { findMany: vi.fn() },
  },
}));

const runEmailOpsMock = vi.mocked(runJoleneEmailOperationsAgent);
const startJobSearchRunMock = vi.mocked(startJobSearchRun);
const runDailyCommandCenterAgentMock = vi.mocked(runDailyCommandCenterAgent);

describe("executeJoleneAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.generatedCoverLetter.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.candidateEvidence.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.experienceBullet.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.application.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.application.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.application.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.applicationAnswerMemory.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.applicationAnswerMemory.update).mockResolvedValue({} as never);
    vi.mocked(prisma.applicationOutcome.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.applicationOutcome.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.applicationPacket.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.agentRun.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.agentRun.create).mockResolvedValue({
      id: "chief_run_1",
      userId: "user_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      inputJson: {},
      outputJson: null,
      observabilityJson: {},
      graphThreadId: null,
      currentNode: null,
      workflowStateJson: {},
      workflowVersion: null,
      parentRunId: null,
      status: "RUNNING",
      error: null,
      createdAt: new Date("2026-05-19T12:00:00.000Z"),
      updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    } as never);
    vi.mocked(prisma.agentRun.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.agentRun.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.agentRun.update).mockResolvedValue({
      id: "chief_run_1",
      userId: "user_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      inputJson: {},
      outputJson: {},
      observabilityJson: {},
      graphThreadId: null,
      currentNode: null,
      workflowStateJson: {},
      workflowVersion: null,
      parentRunId: null,
      status: "COMPLETED",
      error: null,
      createdAt: new Date("2026-05-19T12:00:00.000Z"),
      updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    } as never);
    vi.mocked(prisma.agentRunEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.agentUserRequest.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.agentUserRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.careerMission.findUnique).mockResolvedValue({
      id: "mission_1",
      userId: "user_1",
      targetCompensationMin: 180000,
      targetCompensationIdeal: 240000,
      currency: "USD",
      horizonDays: 30,
      urgencyMode: "HIGH_INCOME_SPRINT",
      tradeoffPolicy: "AGGRESSIVE_BUT_TRUTHFUL",
      roleTracks: ["AI product engineer"],
      dealbreakers: ["unsupported claims"],
      acceptableFallbacks: ["contract"],
      dailyCapacityMinutes: 120,
      energyNotes: null,
      tonePreferences: { directness: "high" },
      createdAt: new Date("2026-05-19T12:00:00.000Z"),
      updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    } as never);
    vi.mocked(prisma.careerMission.create).mockResolvedValue({} as never);
    vi.mocked(prisma.careerMission.update).mockResolvedValue({} as never);
    vi.mocked(prisma.careerSprintSnapshot.create).mockResolvedValue({ id: "snapshot_1" } as never);
    vi.mocked(prisma.careerSprintSnapshot.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.jobProfileMatch.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.jobProfileMatch.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobProfileMatch.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPosting.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobPosting.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.jobSearchProfile.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobSearchRun.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.jobSuppression.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.linkedInPostDraft.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.skillFeedback.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.skillFeedback.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", email: "user@example.com", name: "Carl" } as never);
    vi.mocked(prisma.workExperience.findMany).mockResolvedValue([] as never);
  });

  it("checks email when the user asks Jolene to check Gmail", async () => {
    runEmailOpsMock.mockResolvedValue(emailOpsResult());

    const result = await executeJoleneAction("check my gmail for responses");

    expect(runEmailOpsMock).toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Email Ops");
    expect(result.actionJson).toMatchObject({ action: "jolene_adk_operator" });
    expect(result.executedActions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "sync_email" })]));
    expect(result.clientAction).toEqual({ type: "navigate", href: "/dashboard/email-ops", refresh: true });
  });

  it("pulls a saved application answer before broad coaching", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.applicationAnswerMemory.findMany).mockResolvedValue([
      {
        id: "memory_1",
        userId: "user_1",
        questionCanonical: "how hear about job",
        questionText: "How did you hear about this position?",
        answer: "I found it through a curated job search workflow that tracks roles on company career pages.",
        sensitivity: "LOW",
        reusePolicy: "AUTO_USE",
        sourceApplicationId: null,
        sourceRequestId: null,
        useCount: 2,
        lastUsedAt: new Date("2026-05-18T12:00:00.000Z"),
        createdAt: new Date("2026-05-17T12:00:00.000Z"),
        updatedAt: new Date("2026-05-18T12:00:00.000Z"),
      },
    ] as never);

    const result = await executeJoleneAction('pull up the latest answer I gave for "How did you hear about this position?"', { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "answer_memory_lookup" });
    expect(result.reply).toContain("How did you hear about this position?");
    expect(result.reply).toContain("curated job search workflow");
    expect(result.reply).not.toContain("Interview-ready talking points");
    expect(prisma.applicationAnswerMemory.update).toHaveBeenCalledWith({
      where: { id: "memory_1" },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: expect.any(Date),
      },
    });
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
    expect(result.actionJson).toMatchObject({ action: "jolene_adk_operator" });
    expect(result.executedActions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "run_job_search" })]));
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

    expect(runEmailOpsMock).not.toHaveBeenCalled();
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

  it("executes multiple safe app-operator actions directly", async () => {
    startJobSearchRunMock.mockResolvedValue({
      started: true,
      skipped: false,
      reason: null,
      run: { id: "search_1" },
    } as never);
    const { runDuplicateStaleJobDetectorAgent } = await import("@/lib/agents/duplicate-stale-job-detector");
    vi.mocked(runDuplicateStaleJobDetectorAgent).mockResolvedValue({
      output: { analyzedJobs: 10, duplicateGroups: [{ id: "dup_1" }], updatedJobs: 2 },
    } as never);
    runDailyCommandCenterAgentMock.mockResolvedValue({
      output: { summary: "Today, submit prepared applications.", actions: [{ title: "Submit", priority: 1 }] },
    } as never);

    const result = await executeJoleneAction("Run a fresh job search, check duplicates, and refresh the daily command center.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "jolene_adk_operator" });
    expect(result.executedActions?.map((action) => action.id)).toEqual(["run_job_search", "check_duplicates", "run_daily_command_center"]);
    expect(result.reply).toContain("ADK app-operator tools");
    expect(result.requiresConfirmation).toBeFalsy();
  });

  it("requires confirmation for guarded job mutations", async () => {
    const result = await executeJoleneAction("Approve the top 5 jobs if they look good.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actionJson).toMatchObject({
      confirmationPlanId: expect.any(String),
      allowedExecution: "internal_repairs_only",
      expiresAt: expect.any(String),
    });
    expect(result.plannedActions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "guarded_app_mutation", risk: "guarded_mutation" })]));
    expect(startJobSearchRunMock).not.toHaveBeenCalled();
  });

  it("plans confirmed internal application integrity repair", async () => {
    const result = await executeJoleneAction("Repair application state drift.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.actionJson).toMatchObject({
      action: "jolene_adk_operator",
      confirmationPlanId: expect.any(String),
      allowedExecution: "internal_repairs_only",
      plannedActions: [
        expect.objectContaining({
          id: "repair_application_integrity",
          executable: true,
          href: "/applications",
          status: "planned",
        }),
      ],
    });
  });

  it("diagnoses why an applied role is still visible in active application state", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.application.findMany).mockResolvedValue([
      {
        id: "app_ready",
        status: "ready_to_apply",
        jobPosting: { id: "job_1", company: "Linear", title: "Senior / Staff Fullstack Engineer", duplicateGroupId: "dup_1" },
      },
      {
        id: "app_applied",
        status: "applied",
        jobPosting: { id: "job_2", company: "Linear", title: "Senior / Staff Fullstack Engineer", duplicateGroupId: "dup_1" },
      },
    ] as never);
    vi.mocked(prisma.jobProfileMatch.findMany).mockResolvedValue([
      {
        id: "match_1",
        status: "approved",
        overallScore: 95,
        jobPosting: { id: "job_1", company: "Linear", title: "Senior / Staff Fullstack Engineer", duplicateGroupId: "dup_1" },
        jobSearchProfile: { name: "AI Product Frontend" },
      },
    ] as never);
    vi.mocked(prisma.jobPosting.findMany).mockResolvedValue([
      { id: "job_1", company: "Linear", title: "Senior / Staff Fullstack Engineer", duplicateGroupId: "dup_1", updatedAt: new Date() },
    ] as never);

    const result = await executeJoleneAction("Why is Linear still showing in ready to apply if I already applied?", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "jolene_adk_operator" });
    expect(result.reply).toContain("sync issue");
    expect(result.actionJson?.diagnostics).toMatchObject({ recommendedAction: "run_application_integrity_repair" });
  });

  it("grounds broad job-quality questions in app-wide sources", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.jobProfileMatch.groupBy).mockResolvedValue([
      { status: "needs_review", _count: { _all: 12 } },
      { status: "rejected", _count: { _all: 30 } },
    ] as never);
    vi.mocked(prisma.application.groupBy).mockResolvedValue([
      { status: "approved", _count: { _all: 2 } },
      { status: "applied", _count: { _all: 4 } },
    ] as never);
    vi.mocked(prisma.agentUserRequest.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.applicationPacket.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.jobSearchProfile.findMany).mockResolvedValue([
      {
        id: "profile_1",
        name: "AI Product Frontend",
        enabled: true,
        scheduleEnabled: true,
        minimumMatchScore: 85,
        titles: ["Staff Frontend Engineer"],
        keywordsRequired: ["React", "TypeScript"],
        keywordsPreferred: ["AI", "agents"],
        keywordsExcluded: ["WordPress"],
        countries: ["US"],
        remotePreference: "remote_us_only",
      },
    ] as never);
    vi.mocked(prisma.jobSearchRun.findFirst).mockResolvedValue({
      id: "run_1",
      status: "completed",
      jobsFetched: 100,
      jobsAfterDedupe: 80,
      jobsSaved: 0,
      errors: [],
      startedAt: new Date("2026-05-18T12:00:00.000Z"),
      finishedAt: new Date("2026-05-18T12:05:00.000Z"),
    } as never);
    vi.mocked(prisma.jobPosting.groupBy).mockResolvedValue([{ duplicateGroupId: "dup_1", _count: { _all: 3 } }] as never);
    vi.mocked(prisma.jobSuppression.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.jobProfileMatch.findMany).mockResolvedValue([
      {
        id: "match_1",
        status: "rejected",
        overallScore: 88,
        recommendedAction: "REJECT",
        strongestMatches: ["React", "TypeScript"],
        concerns: ["No AI product signal"],
        missingKeywords: ["agents"],
        jobPosting: { id: "job_1", company: "Acme", title: "Frontend Engineer", duplicateGroupId: null, staleScore: 0 },
        jobSearchProfile: { id: "profile_1", name: "AI Product Frontend" },
      },
    ] as never);

    const result = await executeJoleneAction("Why am I not getting better jobs from search?", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({
      action: "jolene_grounded_answer",
      checkedSources: expect.arrayContaining(["search_profiles", "search_runs", "jobs"]),
      retrievedItems: expect.arrayContaining([expect.objectContaining({ type: "search_profiles", title: "AI Product Frontend" })]),
    });
    expect(result.reply).toContain("I checked");
    expect(result.reply).toContain("Latest search run completed");
    expect(result.reply).toContain("/profiles");
  });

  it("returns a Career CEO brief for high-income sprint requests", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.application.findMany)
      .mockResolvedValueOnce([
        {
          id: "app_ready",
          status: "ready_to_apply",
          updatedAt: new Date("2026-05-19T12:00:00.000Z"),
          jobPosting: {
            id: "job_ready",
            company: "Acme AI",
            title: "Staff AI Product Engineer",
            salaryMin: 200000,
            salaryMax: 260000,
          },
          jobProfileMatch: { overallScore: 92 },
        },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.jobProfileMatch.findMany).mockResolvedValue([
      {
        id: "match_1",
        status: "needs_review",
        overallScore: 91,
        updatedAt: new Date("2026-05-19T12:00:00.000Z"),
        jobPosting: {
          id: "job_1",
          company: "Vercel",
          title: "Staff Frontend Engineer",
          salaryMin: null,
          salaryMax: null,
        },
        jobSearchProfile: { name: "Staff Frontend", salaryMin: 180000, salaryCurrency: "USD" },
      },
    ] as never);
    vi.mocked(prisma.jobSearchProfile.findMany).mockResolvedValue([
      { id: "profile_1", name: "Staff Frontend", salaryMin: 180000, salaryMax: 260000, salaryCurrency: "USD", minimumMatchScore: 85 },
    ] as never);

    const result = await executeJoleneAction("Give me the Career CEO brief and money moves.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({
      action: "jolene_chief_of_staff_brief",
      chiefRunId: "chief_run_1",
      chiefBrief: expect.objectContaining({ title: "Jolene, Chief of Staff" }),
      missionContext: expect.objectContaining({ urgencyMode: "HIGH_INCOME_SPRINT" }),
      moneyMoves: expect.arrayContaining([expect.objectContaining({ title: expect.any(String) })]),
      pipelineLeverage: expect.objectContaining({ highScoreJobs: expect.any(Number) }),
    });
    expect(result.reply).toContain("Jolene, Chief of Staff");
    expect(result.reply).toContain("Jolene career brief");
  });

  it("returns a closed-loop Career CEO standup", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.application.findMany)
      .mockResolvedValueOnce([
        {
          id: "app_ready",
          status: "ready_to_apply",
          updatedAt: new Date("2026-05-19T12:00:00.000Z"),
          jobPosting: {
            id: "job_ready",
            company: "Acme AI",
            title: "Staff AI Product Engineer",
            salaryMin: 200000,
            salaryMax: 260000,
          },
          jobProfileMatch: { overallScore: 92 },
        },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.jobProfileMatch.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.jobSearchProfile.findMany).mockResolvedValue([
      { id: "profile_1", name: "Staff Frontend", salaryMin: 180000, salaryMax: 260000, salaryCurrency: "USD", minimumMatchScore: 85 },
    ] as never);

    const result = await executeJoleneAction("Give me the Career CEO standup and sprint score.", { userId: "user_1" });

    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({
      action: "jolene_chief_of_staff_standup",
      chiefRunId: "chief_run_1",
      chiefBrief: expect.objectContaining({ title: "Jolene, Chief of Staff" }),
      sprintScore: expect.any(Number),
      incomeMomentum: "insufficient_data",
      moneyMoveStatus: expect.arrayContaining([expect.objectContaining({ status: "new" })]),
    });
    expect(result.reply).toContain("Jolene, Chief of Staff");
    expect(result.reply).toContain("Jolene standup");
    expect(prisma.careerSprintSnapshot.create).toHaveBeenCalled();
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

function emailOpsResult() {
  const now = new Date("2026-06-14T10:00:00.000Z");
  return {
    run: {
      id: "email_ops_run_1",
      agentType: "JOLENE_EMAIL_OPERATIONS",
      userId: "user_1",
      inputJson: {},
      outputJson: {},
      observabilityJson: {},
      graphThreadId: null,
      currentNode: null,
      workflowStateJson: {},
      workflowVersion: null,
      parentRunId: null,
      status: "COMPLETED",
      error: null,
      createdAt: now,
      updatedAt: now,
    },
    output: {
      generatedAt: now.toISOString(),
      title: "Jolene Email Operations",
      summary: "Email Ops reviewed 3 messages.",
      scanned: 3,
      ingested: 2,
      findingsCreated: 1,
      autoApplied: 1,
      needsApproval: 0,
      calendarDrafts: 0,
      providerStatuses: [{ provider: "gmail", ok: true, detail: "2/3 ingested" }],
      specialistRuns: [],
      approvals: [],
      risks: [],
      evidence: [],
    },
  } as Awaited<ReturnType<typeof runJoleneEmailOperationsAgent>>;
}
