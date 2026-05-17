import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptImprovementProposal,
  backfillAgentQualityExamples,
  createQualityExampleFromAutomationRun,
  proposeImprovementsFromFailedExamples,
  runAgentQualityEvaluations,
  runApplicationAssistantEvaluations,
} from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentQualityDataset: {
      upsert: vi.fn(),
    },
    applicationAutomationRun: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    agentRun: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    jobSearchRun: {
      findMany: vi.fn(),
    },
    jobProfileMatch: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    agentQualityExample: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    agentQualityEvaluation: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    agentImprovementProposal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    skillAdjustment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const datasetUpsertMock = vi.mocked(prisma.agentQualityDataset.upsert);
const runFindUniqueMock = vi.mocked(prisma.applicationAutomationRun.findUnique);
const automationRunFindManyMock = vi.mocked(prisma.applicationAutomationRun.findMany);
const agentRunFindManyMock = vi.mocked(prisma.agentRun.findMany);
const jobSearchRunFindManyMock = vi.mocked(prisma.jobSearchRun.findMany);
const jobProfileMatchFindManyMock = vi.mocked(prisma.jobProfileMatch.findMany);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const exampleFindFirstMock = vi.mocked(prisma.agentQualityExample.findFirst);
const exampleCreateMock = vi.mocked(prisma.agentQualityExample.create);
const exampleFindManyMock = vi.mocked(prisma.agentQualityExample.findMany);
const evaluationCreateMock = vi.mocked(prisma.agentQualityEvaluation.create);
const evaluationFindManyMock = vi.mocked(prisma.agentQualityEvaluation.findMany);
const proposalFindFirstMock = vi.mocked(prisma.agentImprovementProposal.findFirst);
const proposalFindUniqueMock = vi.mocked(prisma.agentImprovementProposal.findUnique);
const proposalCreateMock = vi.mocked(prisma.agentImprovementProposal.create);
const proposalUpdateMock = vi.mocked(prisma.agentImprovementProposal.update);
const skillAdjustmentFindFirstMock = vi.mocked(prisma.skillAdjustment.findFirst);
const skillAdjustmentCreateMock = vi.mocked(prisma.skillAdjustment.create);

describe("agent quality evaluation loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    datasetUpsertMock.mockResolvedValue({ id: "dataset_1" } as never);
    exampleFindFirstMock.mockResolvedValue(null);
    exampleCreateMock.mockImplementation((input) => ({ id: "example_1", ...(input as any).data }) as never);
    evaluationCreateMock.mockImplementation((input) => ({ id: "eval_1", ...(input as any).data }) as never);
    proposalFindFirstMock.mockResolvedValue(null);
    proposalCreateMock.mockResolvedValue({ id: "proposal_1" } as never);
    proposalFindUniqueMock.mockResolvedValue(null);
    proposalUpdateMock.mockImplementation((input) => ({ id: (input as any).where.id, ...(input as any).data }) as never);
    skillAdjustmentFindFirstMock.mockResolvedValue(null);
    skillAdjustmentCreateMock.mockImplementation((input) => ({ id: "adjustment_1", ...(input as any).data }) as never);
    automationRunFindManyMock.mockResolvedValue([] as never);
    agentRunFindManyMock.mockResolvedValue([] as never);
    jobSearchRunFindManyMock.mockResolvedValue([] as never);
    jobProfileMatchFindManyMock.mockResolvedValue([] as never);
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
  });

  it("creates redacted assistant examples from failed automation runs", async () => {
    runFindUniqueMock.mockResolvedValue(automationRun({
      status: "FAILED",
      blockerType: "assistant_error",
      blockerMessage: "The assistant run failed before completing.",
    }) as never);

    await createQualityExampleFromAutomationRun("run_1");

    expect(exampleCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target: "APPLICATION_ASSISTANT",
        source: "AUTOMATION_RUN",
        failureCategory: "assistant_runtime_error",
        automationRunId: "run_1",
        actualJson: expect.objectContaining({
          blockerMessage: "The assistant run failed before completing.",
        }),
      }),
    }));
  });

  it("evaluates failed examples and creates propose-only improvements", async () => {
    exampleFindManyMock.mockResolvedValue([
      {
        id: "example_1",
        userId: "user_1",
        datasetId: "dataset_1",
        agentRunId: null,
        failureCategory: "manual_submit_detection",
        source: "MANUAL_REPAIR",
        actualJson: { status: "SUBMITTED" },
        evaluations: [],
      },
    ] as never);
    evaluationFindManyMock.mockResolvedValue([
      {
        id: "eval_1",
        userId: "user_1",
        exampleId: "example_1",
        failureCategory: "manual_submit_detection",
        status: "NEEDS_REVIEW",
        example: { id: "example_1" },
      },
    ] as never);

    const result = await runApplicationAssistantEvaluations("user_1");

    expect(result.evaluated).toBe(1);
    expect(evaluationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "NEEDS_REVIEW",
        failureCategory: "manual_submit_detection",
      }),
    }));
    expect(proposalCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PROPOSED",
        type: "WORKFLOW",
        title: "Improve manual submit detection",
      }),
    }));
  });

  it("does not create duplicate open proposals for the same failure category", async () => {
    evaluationFindManyMock.mockResolvedValue([
      {
        id: "eval_1",
        userId: "user_1",
        exampleId: "example_1",
        failureCategory: "browser_lifecycle",
        status: "FAILED",
        example: { id: "example_1" },
      },
    ] as never);
    proposalFindFirstMock.mockResolvedValue({ id: "proposal_existing" } as never);

    const result = await proposeImprovementsFromFailedExamples("user_1");

    expect(result.created).toBe(0);
    expect(proposalCreateMock).not.toHaveBeenCalled();
  });

  it("evaluates recruiting agency quality examples with target-specific scoring", async () => {
    exampleFindManyMock.mockResolvedValue([
      {
        id: "example_agency",
        userId: "user_1",
        datasetId: "dataset_1",
        agentRunId: "agent_run_1",
        failureCategory: "stale_graph_run",
        source: "AGENT_RUN",
        actualJson: { status: "FAILED", workflowState: { resultCount: 0, candidateCount: 2 } },
        evaluations: [],
      },
    ] as never);
    evaluationFindManyMock.mockResolvedValue([
      {
        id: "eval_agency",
        userId: "user_1",
        exampleId: "example_agency",
        failureCategory: "stale_graph_run",
        status: "FAILED",
        example: { id: "example_agency" },
      },
    ] as never);

    const result = await runAgentQualityEvaluations({ userId: "user_1", target: "RECRUITING_AGENCY" });

    expect(result.targets).toEqual(expect.arrayContaining([expect.objectContaining({ target: "RECRUITING_AGENCY", evaluated: 1 })]));
    expect(evaluationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target: "RECRUITING_AGENCY",
        evaluatorVersion: "recruiting-agency-quality-v1",
        status: "FAILED",
        score: 35,
      }),
    }));
    expect(proposalCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target: "RECRUITING_AGENCY",
        title: "Improve recruiting agency stale-run recovery",
      }),
    }));
  });

  it("backfills job search and job matching examples", async () => {
    jobSearchRunFindManyMock.mockResolvedValue([
      {
        id: "search_1",
        startedAt: new Date("2026-05-17T10:00:00Z"),
        status: "completed",
        triggeredBy: "manual",
        profileIds: [],
        jobsFetched: 20,
        jobsAfterDedupe: 19,
        jobsAfterFilters: 19,
        jobsSaved: 0,
        progress: [],
        errors: [],
        createdAt: new Date("2026-05-17T10:00:00Z"),
      },
    ] as never);
    jobProfileMatchFindManyMock.mockResolvedValue([
      {
        id: "match_1",
        jobPostingId: "job_1",
        status: "rejected",
        overallScore: 92,
        recommendedAction: "APPLY_NOW",
        concerns: [],
        missingKeywords: [],
        aiExplanation: "Strong match",
        jobPosting: { id: "job_1", company: "Acme", title: "Senior Engineer" },
        jobSearchProfile: { userId: "user_1", name: "Senior Frontend" },
      },
    ] as never);

    const result = await backfillAgentQualityExamples({ userId: "user_1" });

    expect(result.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "JOB_SEARCH", examples: 1 }),
      expect.objectContaining({ target: "JOB_MATCHING", examples: 1 }),
    ]));
    expect(exampleCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ target: "JOB_SEARCH", failureCategory: "low_saved_yield" }),
    }));
    expect(exampleCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ target: "JOB_MATCHING", failureCategory: "high_score_user_rejected" }),
    }));
  });

  it("activates accepted low-risk proposals as skill adjustments", async () => {
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "JOB_MATCHING",
      type: "CLASSIFIER",
      riskLevel: "LOW",
      category: "high_score_user_rejected",
    }) as never);
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "JOB_MATCHING",
      type: "CLASSIFIER",
      riskLevel: "LOW",
      category: "high_score_user_rejected",
    }) as never);

    const result = await acceptImprovementProposal("proposal_1");

    expect(skillAdjustmentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        skillId: "job_fit_scorer",
        kind: "GUIDANCE",
        status: "ACTIVE",
        patchJson: expect.objectContaining({
          proposalId: "proposal_1",
          source: "quality_proposal",
          category: "high_score_user_rejected",
        }),
      }),
    }));
    expect(result.activation).toEqual(expect.objectContaining({ status: "created", skillId: "job_fit_scorer" }));
    expect(proposalUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "ACCEPTED",
        metadataJson: expect.objectContaining({
          activation: expect.objectContaining({ status: "created" }),
        }),
      }),
    }));
  });

  it("does not create duplicate skill adjustments when proposal activation already exists", async () => {
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "JOB_SEARCH",
      type: "WORKFLOW",
      riskLevel: "LOW",
      category: "dedupe_ineffective",
    }) as never);
    skillAdjustmentFindFirstMock.mockResolvedValue({ id: "adjustment_existing" } as never);
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "JOB_SEARCH",
      type: "WORKFLOW",
      riskLevel: "LOW",
      category: "dedupe_ineffective",
    }) as never);

    const result = await acceptImprovementProposal("proposal_1");

    expect(skillAdjustmentCreateMock).not.toHaveBeenCalled();
    expect(result.activation).toEqual(expect.objectContaining({ status: "already_active", adjustmentId: "adjustment_existing" }));
  });

  it("accepts high-risk or unmapped proposals as review-only", async () => {
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "APPLICATION_ASSISTANT",
      type: "WORKFLOW",
      riskLevel: "HIGH",
      category: "browser_lifecycle",
    }) as never);
    proposalFindUniqueMock.mockResolvedValueOnce(improvementProposal({
      target: "APPLICATION_ASSISTANT",
      type: "WORKFLOW",
      riskLevel: "HIGH",
      category: "browser_lifecycle",
    }) as never);

    const result = await acceptImprovementProposal("proposal_1");

    expect(skillAdjustmentCreateMock).not.toHaveBeenCalled();
    expect(result.activation).toEqual(expect.objectContaining({ status: "review_only" }));
  });
});

function automationRun(input: { status: string; blockerType: string | null; blockerMessage: string | null }) {
  return {
    id: "run_1",
    userId: "user_1",
    applicationId: "app_1",
    jobPostingId: "job_1",
    status: input.status,
    currentNode: "finalizeRun",
    blockerType: input.blockerType,
    blockerMessage: input.blockerMessage,
    workflowStateJson: { status: input.status, events: [] },
    observabilityJson: {},
    application: { id: "app_1" },
    jobPosting: {
      id: "job_1",
      company: "Confluent",
      title: "Senior Software Engineer II",
      atsProvider: "ashby",
    },
  };
}

function improvementProposal(input: { target: string; type: string; riskLevel: string; category: string }) {
  return {
    id: "proposal_1",
    userId: "user_1",
    target: input.target,
    type: input.type,
    status: "PROPOSED",
    riskLevel: input.riskLevel,
    title: "Tighten quality behavior",
    summary: "Detected repeated quality issues.",
    rationale: "Repeated examples should influence future skill runs.",
    affectedExampleIds: ["example_1"],
    patchJson: { category: input.category },
    metadataJson: { failureCategory: input.category },
    skillFeedbackId: null,
    acceptedAt: null,
    dismissedAt: null,
    createdAt: new Date("2026-05-17T10:00:00Z"),
    updatedAt: new Date("2026-05-17T10:00:00Z"),
  };
}
