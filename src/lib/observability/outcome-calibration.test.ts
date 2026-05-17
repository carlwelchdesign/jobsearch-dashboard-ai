import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOutcomeCalibration,
  getOutcomeCalibrationTrends,
  getOutcomeRegressionTriage,
  proposeOutcomeTrendRegressionReviews,
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
    outcomeCalibrationSnapshot: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
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
const snapshotFindManyMock = vi.mocked(prisma.outcomeCalibrationSnapshot.findMany);
const snapshotFindFirstMock = vi.mocked(prisma.outcomeCalibrationSnapshot.findFirst);
const snapshotCreateMock = vi.mocked(prisma.outcomeCalibrationSnapshot.create);
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
    proposalFindManyMock.mockResolvedValue([{ id: "proposal_1", status: "PROPOSED", metadataJson: {}, patchJson: {} }] as never);
    proposalFindFirstMock.mockResolvedValue(null);
    proposalCreateMock.mockImplementation((input) => ({ id: `proposal_${String((input as any).data.metadataJson.actionId).replace(/[^a-z0-9]/gi, "_")}` }) as never);
    snapshotFindManyMock.mockResolvedValue([] as never);
    snapshotFindFirstMock.mockResolvedValue(null);
    snapshotCreateMock.mockResolvedValue({ id: "snapshot_1" } as never);
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
      proposal: null,
    });
  });

  it("links outcome review actions to proposal lifecycle metadata", async () => {
    proposalFindManyMock.mockResolvedValue([
      outcomeProposal({
        id: "proposal_open",
        status: "PROPOSED",
        actionCategory: "repair_suppression",
        targetType: "job",
        targetId: "job_4",
        category: "suppression_resurfacing",
      }),
      outcomeProposal({
        id: "proposal_accepted",
        status: "ACCEPTED",
        actionCategory: "resolve_duplicates",
        targetType: "duplicate_group",
        targetId: "dup_2",
        category: "dedupe_ineffective",
        riskLevel: "LOW",
        activation: { status: "created", reason: "Accepted low-risk proposal activated as skill guidance." },
      }),
      outcomeProposal({
        id: "proposal_dismissed",
        status: "DISMISSED",
        actionCategory: "review_assistant_failures",
        targetType: "application",
        targetId: "app_1",
        category: "assistant_outcome_failure",
      }),
    ] as never);

    const report = await getOutcomeCalibration("user_1");

    expect(report.actions.find((action) => action.category === "repair_suppression")?.proposal).toMatchObject({
      id: "proposal_open",
      status: "PROPOSED",
      activationLabel: "review_only",
    });
    expect(report.actions.find((action) => action.category === "resolve_duplicates")?.proposal).toMatchObject({
      id: "proposal_accepted",
      status: "ACCEPTED",
      activationLabel: "learning_active",
    });
    expect(report.actions.find((action) => action.category === "review_assistant_failures")?.proposal).toMatchObject({
      id: "proposal_dismissed",
      status: "DISMISSED",
    });
    expect(report.actions.find((action) => action.category === "tighten_profile")?.proposal).toBeNull();
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
    expect(snapshotCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        source: "job_rejected",
        summaryJson: expect.objectContaining({ applications: 3 }),
      }),
    }));
  });

  it("throttles automatic outcome snapshots", async () => {
    snapshotFindFirstMock.mockResolvedValue({ id: "snapshot_recent" } as never);

    await recomputeOutcomeCalibration("user_1", { source: "assistant_state" });

    expect(snapshotFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user_1" }),
    }));
    expect(snapshotCreateMock).not.toHaveBeenCalled();
  });

  it("builds outcome trend summaries from persisted snapshots", async () => {
    snapshotFindManyMock.mockResolvedValue([
      snapshot({
        id: "snapshot_latest",
        summaryJson: { callbackRate: 20, rejectedHighScoreMatches: 1, duplicateActiveGroups: 0, resurfacedSuppressedJobs: 0, assistantFailures: 1 },
        workflowsJson: [{ target: "JOB_SEARCH", score: 90, status: "healthy", summary: "Latest", metrics: {} }],
      }),
      snapshot({
        id: "snapshot_previous",
        summaryJson: { callbackRate: 10, rejectedHighScoreMatches: 3, duplicateActiveGroups: 2, resurfacedSuppressedJobs: 1, assistantFailures: 1 },
        workflowsJson: [{ target: "JOB_SEARCH", score: 70, status: "watch", summary: "Previous", metrics: {} }],
      }),
    ] as never);

    const trends = await getOutcomeCalibrationTrends("user_1");

    expect(trends.snapshots).toHaveLength(2);
    expect(trends.metrics.find((metric) => metric.key === "callbackRate")).toMatchObject({
      latest: 20,
      previous: 10,
      delta: 10,
      direction: "improving",
    });
    expect(trends.metrics.find((metric) => metric.key === "duplicateActiveGroups")).toMatchObject({
      direction: "improving",
    });
    expect(trends.metrics.find((metric) => metric.key === "assistantFailures")).toMatchObject({
      direction: "flat",
    });
    expect(trends.workflows.find((workflow) => workflow.target === "JOB_SEARCH")).toMatchObject({
      latestScore: 90,
      previousScore: 70,
      direction: "improving",
    });
    expect(trends.workflows.find((workflow) => workflow.target === "APPLICATION_ASSISTANT")).toMatchObject({
      direction: "insufficient_data",
    });
  });

  it("creates review-only proposals for regressing outcome trends", async () => {
    snapshotFindManyMock.mockResolvedValue([
      snapshot({
        id: "snapshot_latest",
        summaryJson: { callbackRate: 5, rejectedHighScoreMatches: 4, duplicateActiveGroups: 3, resurfacedSuppressedJobs: 2, assistantFailures: 2 },
        workflowsJson: [
          { target: "JOB_SEARCH", score: 60, status: "needs_review", summary: "Latest", metrics: {} },
          { target: "APPLICATION_ASSISTANT", score: 70, status: "watch", summary: "Latest", metrics: {} },
        ],
      }),
      snapshot({
        id: "snapshot_previous",
        summaryJson: { callbackRate: 15, rejectedHighScoreMatches: 1, duplicateActiveGroups: 1, resurfacedSuppressedJobs: 0, assistantFailures: 1 },
        workflowsJson: [
          { target: "JOB_SEARCH", score: 80, status: "watch", summary: "Previous", metrics: {} },
          { target: "APPLICATION_ASSISTANT", score: 90, status: "healthy", summary: "Previous", metrics: {} },
        ],
      }),
    ] as never);

    const result = await proposeOutcomeTrendRegressionReviews("user_1");

    expect(result.created).toBeGreaterThan(0);
    expect(result.scanned).toBe(7);
    expect(proposalCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        status: "PROPOSED",
        riskLevel: "HIGH",
        metadataJson: expect.objectContaining({
          source: "outcome_trend_regression",
          trendKey: "metric:callbackRate",
          latestSnapshotId: "snapshot_latest",
          triage: expect.objectContaining({
            priority: "high",
            ownerArea: "Recruiting agency",
            reviewHref: "/outcomes",
          }),
        }),
        patchJson: expect.objectContaining({
          policy: "proposal_only",
          category: "trend_callbackRate",
        }),
      }),
      select: expect.objectContaining({ id: true }),
    }));
  });

  it("does not create regression proposals without enough trend data", async () => {
    snapshotFindManyMock.mockResolvedValue([
      snapshot({
        id: "snapshot_latest",
        summaryJson: { callbackRate: 5 },
        workflowsJson: [{ target: "JOB_SEARCH", score: 60, status: "needs_review", summary: "Latest", metrics: {} }],
      }),
    ] as never);

    const result = await proposeOutcomeTrendRegressionReviews("user_1");

    expect(result).toMatchObject({ scanned: 0, created: 0, existing: 0, proposals: [] });
    expect(proposalCreateMock).not.toHaveBeenCalled();
  });

  it("dedupes regression proposals by trend and latest snapshot", async () => {
    snapshotFindManyMock.mockResolvedValue([
      snapshot({
        id: "snapshot_latest",
        summaryJson: { callbackRate: 5 },
        workflowsJson: [],
      }),
      snapshot({
        id: "snapshot_previous",
        summaryJson: { callbackRate: 15 },
        workflowsJson: [],
      }),
    ] as never);
    proposalFindFirstMock.mockResolvedValue({
      id: "proposal_existing",
      status: "PROPOSED",
      target: "RECRUITING_AGENCY",
    } as never);

    const result = await proposeOutcomeTrendRegressionReviews("user_1");

    expect(result).toMatchObject({
      scanned: 1,
      created: 0,
      existing: 1,
      proposals: [{ id: "proposal_existing", trendKey: "metric:callbackRate", status: "existing", proposalStatus: "PROPOSED" }],
    });
    expect(proposalCreateMock).not.toHaveBeenCalled();
  });

  it("returns open outcome regression triage sorted by priority", async () => {
    proposalFindManyMock.mockResolvedValue([
      regressionProposal({
        id: "proposal_medium",
        target: "JOB_SEARCH",
        title: "Review duplicate regression",
        metadataJson: {
          source: "outcome_trend_regression",
          trendKey: "metric:duplicateActiveGroups",
          trendKind: "metric",
          latestSnapshotId: "snapshot_latest",
          latest: 3,
          previous: 1,
          delta: 2,
        },
        updatedAt: new Date("2026-05-17T12:00:00.000Z"),
      }),
      regressionProposal({
        id: "proposal_high",
        target: "APPLICATION_ASSISTANT",
        title: "Review assistant regression",
        metadataJson: {
          source: "outcome_trend_regression",
          trendKey: "metric:assistantFailures",
          trendKind: "metric",
          latestSnapshotId: "snapshot_latest",
          latest: 2,
          previous: 1,
          delta: 1,
        },
        updatedAt: new Date("2026-05-17T10:00:00.000Z"),
      }),
    ] as never);

    const triage = await getOutcomeRegressionTriage("user_1");

    expect(proposalFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user_1",
        status: "PROPOSED",
        metadataJson: { path: ["source"], equals: "outcome_trend_regression" },
      }),
    }));
    expect(triage.map((item) => item.proposalId)).toEqual(["proposal_high", "proposal_medium"]);
    expect(triage[0]).toMatchObject({
      priority: "high",
      ownerArea: "Application assistant",
      reviewHref: "/applications/assistant",
      signalType: "assistant_quality",
    });
    expect(triage[1]).toMatchObject({
      priority: "medium",
      ownerArea: "Job search",
      signalType: "search_hygiene",
    });
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
      select: expect.objectContaining({ id: true }),
    }));
  });

  it("does not duplicate open outcome review proposals", async () => {
    proposalFindFirstMock.mockResolvedValue({
      id: "proposal_existing",
      status: "DISMISSED",
      riskLevel: "HIGH",
      target: "JOB_SEARCH",
      type: "WORKFLOW",
    } as never);

    const result = await proposeOutcomeReviewActionImprovements("user_1");

    expect(result).toMatchObject({
      scanned: 5,
      created: 0,
      existing: 5,
    });
    expect(result.proposals[0]).toMatchObject({
      id: "proposal_existing",
      proposalStatus: "DISMISSED",
      riskLevel: "HIGH",
      target: "JOB_SEARCH",
      type: "WORKFLOW",
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

function outcomeProposal(input: {
  id: string;
  status: string;
  actionCategory: string;
  targetType: string;
  targetId: string;
  category: string;
  riskLevel?: string;
  activation?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    userId: "user_1",
    target: input.actionCategory === "review_assistant_failures" ? "APPLICATION_ASSISTANT" : "JOB_SEARCH",
    type: "WORKFLOW",
    status: input.status,
    riskLevel: input.riskLevel ?? "HIGH",
    title: "Linked proposal",
    summary: "Summary",
    rationale: "Rationale",
    affectedExampleIds: [],
    patchJson: { category: input.category },
    metadataJson: {
      source: "outcome_review_action",
      actionCategory: input.actionCategory,
      targetType: input.targetType,
      targetId: input.targetId,
      activation: input.activation,
    },
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
    updatedAt: new Date("2026-05-17T10:00:00.000Z"),
  };
}

function regressionProposal(input: {
  id: string;
  target: string;
  title: string;
  metadataJson: Record<string, unknown>;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    userId: "user_1",
    target: input.target,
    type: "WORKFLOW",
    status: "PROPOSED",
    riskLevel: "HIGH",
    title: input.title,
    summary: "Regression summary",
    rationale: "Rationale",
    affectedExampleIds: [],
    patchJson: { policy: "proposal_only" },
    metadataJson: input.metadataJson,
    createdAt: new Date("2026-05-17T09:00:00.000Z"),
    updatedAt: input.updatedAt,
  };
}

function snapshot(input: {
  id: string;
  summaryJson: Record<string, unknown>;
  workflowsJson: Array<Record<string, unknown>>;
}) {
  return {
    id: input.id,
    userId: "user_1",
    source: "settings_manual",
    summaryJson: input.summaryJson,
    workflowsJson: input.workflowsJson,
    signalsJson: [],
    actionsJson: [],
    createdAt: new Date(input.id === "snapshot_latest" ? "2026-05-17T10:00:00.000Z" : "2026-05-16T10:00:00.000Z"),
  };
}
