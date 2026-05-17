import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOutcomeCalibration,
  proposeOutcomeReviewActionImprovements,
  recomputeOutcomeCalibration,
  refreshOutcomeCalibration,
} from "@/lib/observability/outcome-calibration";
import { ensureAgentQualityDataset, proposeImprovementsFromFailedExamples } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/observability/quality", () => ({
  ensureAgentQualityDataset: vi.fn(),
  proposeImprovementsFromFailedExamples: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    application: { findMany: vi.fn() },
    jobProfileMatch: { findMany: vi.fn() },
    jobSuppression: { findMany: vi.fn() },
    applicationAutomationRun: { findMany: vi.fn() },
    agentQualityExample: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    agentImprovementProposal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const applicationFindManyMock = vi.mocked(prisma.application.findMany);
const matchFindManyMock = vi.mocked(prisma.jobProfileMatch.findMany);
const suppressionFindManyMock = vi.mocked(prisma.jobSuppression.findMany);
const automationFindManyMock = vi.mocked(prisma.applicationAutomationRun.findMany);
const exampleFindManyMock = vi.mocked(prisma.agentQualityExample.findMany);
const exampleFindFirstMock = vi.mocked(prisma.agentQualityExample.findFirst);
const exampleCreateMock = vi.mocked(prisma.agentQualityExample.create);
const proposalFindManyMock = vi.mocked(prisma.agentImprovementProposal.findMany);
const proposalFindFirstMock = vi.mocked(prisma.agentImprovementProposal.findFirst);
const proposalCreateMock = vi.mocked(prisma.agentImprovementProposal.create);
const ensureDatasetMock = vi.mocked(ensureAgentQualityDataset);
const proposeMock = vi.mocked(proposeImprovementsFromFailedExamples);

describe("outcome calibration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    applicationFindManyMock.mockResolvedValue([
      application({ id: "app_1", status: "applied", outcomes: [{ outcome: "APPLIED" }] }),
      application({ id: "app_2", status: "screening", outcomes: [{ outcome: "RECRUITER_SCREEN" }] }),
      application({ id: "app_3", status: "rejected_by_company", outcomes: [{ outcome: "REJECTED" }] }),
    ] as never);
    matchFindManyMock.mockResolvedValue([
      match({ id: "match_1", jobPostingId: "job_1", status: "rejected", overallScore: 91, duplicateGroupId: "dup_1" }),
      match({ id: "match_2", jobPostingId: "job_2", status: "approved", overallScore: 80, duplicateGroupId: "dup_2" }),
      match({ id: "match_3", jobPostingId: "job_3", status: "needs_review", overallScore: 77, duplicateGroupId: "dup_2" }),
      match({ id: "match_4", jobPostingId: "job_4", status: "discovered", overallScore: 70, duplicateGroupId: null }),
    ] as never);
    suppressionFindManyMock.mockResolvedValue([
      {
        id: "suppression_1",
        kind: "REJECTED_JOB",
        canonicalKey: "key",
        companyKey: "company",
        titleFamilyKey: "title",
        jobPostingId: "job_4",
        jobProfileMatchId: null,
        applicationId: null,
        source: "job_reject",
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ] as never);
    automationFindManyMock.mockResolvedValue([
      {
        id: "run_1",
        applicationId: "app_1",
        jobPostingId: "job_1",
        status: "FAILED",
        blockerType: null,
        blockerMessage: null,
        currentNode: "failed",
        startedAt: new Date(),
        jobPosting: { company: "Company", title: "Role" },
      },
    ] as never);
    exampleFindManyMock.mockResolvedValue([{ id: "example_1" }] as never);
    proposalFindManyMock.mockResolvedValue([{ id: "proposal_1", status: "PROPOSED" }] as never);
    proposalFindFirstMock.mockResolvedValue(null);
    proposalCreateMock.mockImplementation((input) => ({ id: `proposal_${String((input as any).data.metadataJson.actionId).replace(/[^a-z0-9]/gi, "_")}` }) as never);
    exampleFindFirstMock.mockResolvedValue(null);
    exampleCreateMock.mockResolvedValue({ id: "created" } as never);
    ensureDatasetMock.mockResolvedValue({ id: "dataset_1" } as never);
    proposeMock.mockResolvedValue({ created: 1 });
  });

  it("builds a workflow scorecard from existing outcomes and noise signals", async () => {
    const report = await getOutcomeCalibration("user_1");

    expect(report.summary).toMatchObject({
      applications: 3,
      applied: 3,
      positiveOutcomes: 1,
      negativeOutcomes: 1,
      callbackRate: 33,
      rejectedHighScoreMatches: 1,
      duplicateActiveGroups: 1,
      resurfacedSuppressedJobs: 1,
      assistantFailures: 1,
      qualityExamples: 1,
      proposedImprovements: 1,
    });
    expect(report.signals.map((signal) => signal.key)).toEqual(expect.arrayContaining([
      "suppression_resurfacing",
      "duplicate_active_groups",
      "rejected_high_score_matches",
      "assistant_failures",
    ]));
    expect(report.details.resurfacedSuppressedJobs[0]).toMatchObject({
      jobId: "job_4",
      matchId: "match_4",
      company: "Company",
      title: "Role",
      matchStatus: "discovered",
    });
    expect(report.details.activeDuplicateGroups[0]).toMatchObject({
      duplicateGroupId: "dup_2",
      activeMatchCount: 2,
    });
    expect(report.details.rejectedHighScoreMatches[0]).toMatchObject({
      matchId: "match_1",
      score: 91,
      profileName: "AI Product",
    });
    expect(report.details.assistantFailures[0]).toMatchObject({
      automationRunId: "run_1",
      status: "FAILED",
      company: "Company",
    });
    expect(report.details.profileBreakdown[0]).toMatchObject({
      profileId: "profile_1",
      profileName: "AI Product",
      rejectedHighScoreMatches: 1,
      applied: 3,
      positiveOutcomes: 1,
      callbackRate: 33,
    });
    expect(report.details.sourceBreakdown[0]).toMatchObject({
      sourceId: "source_1",
      sourceName: "Company Source",
      noisySignals: 1,
    });
    expect(report.actions.map((action) => action.category)).toEqual(expect.arrayContaining([
      "pause_or_review_source",
      "tighten_profile",
      "resolve_duplicates",
      "repair_suppression",
      "review_assistant_failures",
    ]));
    expect(report.actions.find((action) => action.category === "repair_suppression")).toMatchObject({
      severity: "needs_review",
      href: "/jobs/job_4",
    });
  });

  it("returns no review actions for clean calibration data", async () => {
    applicationFindManyMock.mockResolvedValue([
      application({ id: "app_clean", status: "screening", outcomes: [{ outcome: "RECRUITER_SCREEN" }] }),
    ] as never);
    matchFindManyMock.mockResolvedValue([
      match({ id: "match_clean", jobPostingId: "job_clean", status: "approved", overallScore: 82, duplicateGroupId: null }),
    ] as never);
    suppressionFindManyMock.mockResolvedValue([] as never);
    automationFindManyMock.mockResolvedValue([] as never);

    const report = await getOutcomeCalibration("user_1");

    expect(report.actions).toEqual([]);
  });

  it("captures missing outcome signals as redacted quality examples and proposes improvements", async () => {
    const report = await recomputeOutcomeCalibration("user_1", { source: "job_rejected" });

    expect(report.createdExamples).toBe(4);
    expect(exampleCreateMock).toHaveBeenCalledTimes(4);
    expect(exampleCreateMock.mock.calls[0]?.[0].data.metadataJson).toMatchObject({
      source: "outcome_calibration",
      refreshSource: "job_rejected",
    });
    expect(proposeMock).toHaveBeenCalledWith("user_1", "JOB_SEARCH");
    expect(proposeMock).toHaveBeenCalledWith("user_1", "JOB_MATCHING");
    expect(proposeMock).toHaveBeenCalledWith("user_1", "APPLICATION_ASSISTANT");
  });

  it("does not duplicate existing outcome quality examples", async () => {
    exampleFindFirstMock.mockResolvedValue({ id: "existing" } as never);

    const report = await recomputeOutcomeCalibration("user_1");

    expect(report.createdExamples).toBe(0);
    expect(exampleCreateMock).not.toHaveBeenCalled();
  });

  it("promotes outcome review actions into governed proposals", async () => {
    const result = await proposeOutcomeReviewActionImprovements("user_1");

    expect(result).toMatchObject({
      scanned: 5,
      created: 5,
      existing: 0,
    });
    expect(proposalCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        status: "PROPOSED",
        metadataJson: expect.objectContaining({
          source: "outcome_review_action",
          actionCategory: "repair_suppression",
          targetType: "job",
          targetId: "job_4",
        }),
        patchJson: expect.objectContaining({
          policy: "proposal_only",
          category: "suppression_resurfacing",
        }),
      }),
      select: { id: true },
    }));
  });

  it("does not duplicate open outcome review proposals", async () => {
    proposalFindFirstMock.mockResolvedValue({ id: "proposal_existing" } as never);

    const result = await proposeOutcomeReviewActionImprovements("user_1");

    expect(result).toMatchObject({
      scanned: 5,
      created: 0,
      existing: 5,
    });
    expect(proposalCreateMock).not.toHaveBeenCalled();
  });

  it("does not create proposals when no review actions are present", async () => {
    applicationFindManyMock.mockResolvedValue([
      application({ id: "app_clean", status: "screening", outcomes: [{ outcome: "RECRUITER_SCREEN" }] }),
    ] as never);
    matchFindManyMock.mockResolvedValue([
      match({ id: "match_clean", jobPostingId: "job_clean", status: "approved", overallScore: 82, duplicateGroupId: null }),
    ] as never);
    suppressionFindManyMock.mockResolvedValue([] as never);
    automationFindManyMock.mockResolvedValue([] as never);

    const result = await proposeOutcomeReviewActionImprovements("user_1");

    expect(result).toMatchObject({
      scanned: 0,
      created: 0,
      existing: 0,
      proposals: [],
    });
    expect(proposalCreateMock).not.toHaveBeenCalled();
  });

  it("refreshes outcome calibration without throwing when background recompute fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    applicationFindManyMock.mockRejectedValueOnce(new Error("database unavailable"));

    expect(() => refreshOutcomeCalibration({ userId: "user_1", source: "assistant_state" })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).toHaveBeenCalledWith("Outcome calibration refresh failed.", expect.any(Error));
    warn.mockRestore();
  });
});

function application(input: { id: string; status: string; outcomes: Array<{ outcome: string }> }) {
  return {
    id: input.id,
    status: input.status,
    updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    outcomes: input.outcomes.map((outcome) => ({ ...outcome, occurredAt: new Date("2026-05-17T10:00:00.000Z") })),
    jobPosting: {
      id: "job",
      company: "Company",
      title: "Role",
      sourceId: "source_1",
      source: { id: "source_1", name: "Company Source", type: "company_site" },
    },
    jobProfileMatch: {
      id: "match",
      overallScore: 80,
      jobSearchProfileId: "profile_1",
      jobSearchProfile: { id: "profile_1", name: "AI Product" },
    },
  };
}

function match(input: { id: string; jobPostingId: string; status: string; overallScore: number; duplicateGroupId: string | null }) {
  return {
    id: input.id,
    jobPostingId: input.jobPostingId,
    jobSearchProfileId: "profile_1",
    status: input.status,
    overallScore: input.overallScore,
    updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    jobPosting: {
      company: "Company",
      title: "Role",
      duplicateGroupId: input.duplicateGroupId,
      source: { id: "source_1", name: "Company Source", type: "company_site" },
    },
    jobSearchProfile: { id: "profile_1", name: "AI Product" },
  };
}
