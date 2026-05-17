import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLearningImpact } from "@/lib/observability/learning-impact";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    skillAdjustment: { findMany: vi.fn() },
    agentRun: { findMany: vi.fn() },
    agentRunEvent: { findMany: vi.fn() },
    agentQualityEvaluation: { findMany: vi.fn() },
  },
}));

const skillAdjustmentFindManyMock = vi.mocked(prisma.skillAdjustment.findMany);
const agentRunFindManyMock = vi.mocked(prisma.agentRun.findMany);
const agentRunEventFindManyMock = vi.mocked(prisma.agentRunEvent.findMany);
const evaluationFindManyMock = vi.mocked(prisma.agentQualityEvaluation.findMany);

describe("learning impact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentRunEventFindManyMock.mockResolvedValue([] as never);
  });

  it("marks active learning with no later applied runs as insufficient data", async () => {
    skillAdjustmentFindManyMock.mockResolvedValue([
      adjustment({ id: "adjustment_1", skillId: "job_fit_scorer", category: "high_score_user_rejected" }),
    ] as never);
    agentRunFindManyMock.mockResolvedValue([] as never);
    evaluationFindManyMock.mockResolvedValue([] as never);

    const impact = await getLearningImpact("user_1");

    expect(impact[0]).toMatchObject({
      adjustmentId: "adjustment_1",
      status: "insufficient_data",
      appliedRunCount: 0,
      averageScore: null,
    });
  });

  it("marks repeated clean applied runs as helping", async () => {
    skillAdjustmentFindManyMock.mockResolvedValue([
      adjustment({ id: "adjustment_1", skillId: "job_fit_scorer", category: "high_score_user_rejected" }),
    ] as never);
    agentRunFindManyMock.mockResolvedValue([
      run({ id: "run_1", agentType: "JOB_FIT_SCORER", appliedLearning: ["high_score_user_rejected"] }),
      run({ id: "run_2", agentType: "JOB_FIT_SCORER", appliedLearning: ["high_score_user_rejected"] }),
    ] as never);
    evaluationFindManyMock.mockResolvedValue([
      evaluation({ agentRunId: "run_1", target: "JOB_MATCHING", status: "PASSED", score: 88 }),
      evaluation({ agentRunId: "run_2", target: "JOB_MATCHING", status: "PASSED", score: 92 }),
    ] as never);

    const impact = await getLearningImpact("user_1");

    expect(impact[0]).toMatchObject({
      status: "helping",
      appliedRunCount: 2,
      averageScore: 90,
      relatedFailedCount: 0,
    });
  });

  it("marks related failures as needs review", async () => {
    skillAdjustmentFindManyMock.mockResolvedValue([
      adjustment({ id: "adjustment_1", skillId: "application_qa", category: "cover_letter_field" }),
    ] as never);
    agentRunFindManyMock.mockResolvedValue([
      run({ id: "run_1", agentType: "APPLICATION_QA", appliedLearning: ["cover_letter_field"] }),
    ] as never);
    evaluationFindManyMock.mockResolvedValue([
      evaluation({ agentRunId: "run_1", target: "APPLICATION_ASSISTANT", status: "FAILED", score: 35, failureCategory: "cover_letter_field" }),
    ] as never);

    const impact = await getLearningImpact("user_1");

    expect(impact[0]).toMatchObject({
      status: "needs_review",
      relatedFailedCount: 1,
    });
  });

  it("marks sparse mixed signal as neutral", async () => {
    skillAdjustmentFindManyMock.mockResolvedValue([
      adjustment({ id: "adjustment_1", skillId: "duplicate_stale_job_detector", category: "dedupe_ineffective" }),
    ] as never);
    agentRunFindManyMock.mockResolvedValue([
      run({ id: "run_1", agentType: "DUPLICATE_STALE_JOB_DETECTOR", appliedLearning: ["dedupe_ineffective"] }),
    ] as never);
    evaluationFindManyMock.mockResolvedValue([
      evaluation({ agentRunId: "run_1", target: "JOB_SEARCH", status: "PASSED", score: 76 }),
    ] as never);

    const impact = await getLearningImpact("user_1");

    expect(impact[0]).toMatchObject({
      status: "neutral",
      appliedRunCount: 1,
      averageScore: 76,
    });
  });
});

function adjustment(input: { id: string; skillId: string; category: string }) {
  return {
    id: input.id,
    userId: "user_1",
    skillId: input.skillId,
    kind: "GUIDANCE",
    riskLevel: "LOW",
    status: "ACTIVE",
    patchJson: { source: "quality_proposal", category: input.category, proposalId: "proposal_1" },
    rationale: "Activated learning.",
    appliedAt: new Date("2026-05-17T10:00:00.000Z"),
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
  };
}

function run(input: { id: string; agentType: string; appliedLearning: string[] }) {
  return {
    id: input.id,
    agentType: input.agentType,
    outputJson: { appliedLearning: input.appliedLearning },
    createdAt: new Date("2026-05-17T11:00:00.000Z"),
  };
}

function evaluation(input: { agentRunId: string; target: string; status: string; score: number; failureCategory?: string | null }) {
  return {
    id: `eval_${input.agentRunId}`,
    agentRunId: input.agentRunId,
    target: input.target,
    status: input.status,
    score: input.score,
    failureCategory: input.failureCategory ?? null,
    createdAt: new Date("2026-05-17T11:05:00.000Z"),
  };
}
