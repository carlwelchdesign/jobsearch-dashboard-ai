import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutcomeCalibration, recomputeOutcomeCalibration } from "@/lib/observability/outcome-calibration";
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
    agentImprovementProposal: { findMany: vi.fn() },
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
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ] as never);
    automationFindManyMock.mockResolvedValue([
      { id: "run_1", applicationId: "app_1", jobPostingId: "job_1", status: "FAILED", blockerType: null, currentNode: "failed", startedAt: new Date() },
    ] as never);
    exampleFindManyMock.mockResolvedValue([{ id: "example_1" }] as never);
    proposalFindManyMock.mockResolvedValue([{ id: "proposal_1", status: "PROPOSED" }] as never);
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
  });

  it("captures missing outcome signals as redacted quality examples and proposes improvements", async () => {
    const report = await recomputeOutcomeCalibration("user_1");

    expect(report.createdExamples).toBe(4);
    expect(exampleCreateMock).toHaveBeenCalledTimes(4);
    expect(exampleCreateMock.mock.calls[0]?.[0].data.metadataJson).toMatchObject({ source: "outcome_calibration" });
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
});

function application(input: { id: string; status: string; outcomes: Array<{ outcome: string }> }) {
  return {
    id: input.id,
    status: input.status,
    updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    outcomes: input.outcomes.map((outcome) => ({ ...outcome, occurredAt: new Date("2026-05-17T10:00:00.000Z") })),
    jobPosting: { id: "job", company: "Company", title: "Role", sourceId: null },
    jobProfileMatch: { id: "match", overallScore: 80, jobSearchProfileId: "profile_1" },
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
    jobPosting: { company: "Company", title: "Role", duplicateGroupId: input.duplicateGroupId },
  };
}
