import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentQualityGates } from "@/lib/agents/quality-gates";
import { prisma } from "@/lib/prisma";

const state = vi.hoisted(() => ({
  examples: [] as any[],
  evaluations: [] as any[],
  proposals: [] as any[],
  runs: [] as any[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentQualityExample: { groupBy: vi.fn(() => Promise.resolve(state.examples)) },
    agentQualityEvaluation: { findMany: vi.fn(() => Promise.resolve(state.evaluations)) },
    agentImprovementProposal: { groupBy: vi.fn(() => Promise.resolve(state.proposals)) },
    agentRun: { findMany: vi.fn(() => Promise.resolve(state.runs)) },
  },
}));

describe("agent quality gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.examples = [];
    state.evaluations = [];
    state.proposals = [];
    state.runs = [];
  });

  it("marks a target passing when it has fresh passed evaluations", async () => {
    state.examples = [{ target: "GENERATED_MATERIALS", _count: { _all: 3 } }];
    state.evaluations = [{
      id: "eval_1",
      target: "GENERATED_MATERIALS",
      status: "PASSED",
      score: 92,
      summary: "Grounded materials passed.",
      createdAt: new Date(),
    }];

    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "GENERATED_MATERIALS")).toMatchObject({
      status: "pass",
      canScale: true,
      score: 92,
      examples: 3,
    });
  });

  it("blocks a target when the latest evaluation fails", async () => {
    state.examples = [{ target: "JOB_MATCHING", _count: { _all: 2 } }];
    state.evaluations = [{
      id: "eval_2",
      target: "JOB_MATCHING",
      status: "FAILED",
      score: 55,
      summary: "Bad match decisions.",
      createdAt: new Date(),
    }];

    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "JOB_MATCHING")).toMatchObject({
      status: "blocked",
      canScale: false,
      failedEvaluations: 1,
    });
  });

  it("treats proposed improvements as needs-review gates", async () => {
    state.examples = [{ target: "COMMAND_CENTER", _count: { _all: 4 } }];
    state.evaluations = [{
      id: "eval_3",
      target: "COMMAND_CENTER",
      status: "PASSED",
      score: 90,
      summary: "Good command plan.",
      createdAt: new Date(),
    }];
    state.proposals = [{ target: "COMMAND_CENTER", status: "PROPOSED", _count: { _all: 1 } }];

    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "COMMAND_CENTER")).toMatchObject({
      status: "needs_review",
      proposedImprovements: 1,
      canScale: false,
    });
  });

  it("marks old passing evaluations stale", async () => {
    state.examples = [{ target: "OUTCOME_LEARNING", _count: { _all: 2 } }];
    state.evaluations = [{
      id: "eval_4",
      target: "OUTCOME_LEARNING",
      status: "PASSED",
      score: 88,
      summary: "Old pass.",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    }];

    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "OUTCOME_LEARNING")).toMatchObject({
      status: "stale",
      canScale: false,
    });
  });

  it("marks uncovered targets as missing evaluation", async () => {
    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "OUTREACH")).toMatchObject({
      status: "missing_eval",
      canScale: false,
      examples: 0,
      evaluations: 0,
    });
    expect(prisma.agentQualityExample.groupBy).toHaveBeenCalled();
  });

  it("blocks a gate when covered agent runs contain blocked-action events", async () => {
    state.examples = [{ target: "OUTREACH", _count: { _all: 2 } }];
    state.evaluations = [{
      id: "eval_5",
      target: "OUTREACH",
      status: "PASSED",
      score: 95,
      summary: "Outreach passed.",
      createdAt: new Date(),
    }];
    state.runs = [{
      agentType: "EMAIL_ACTION_DRAFTER",
      events: [{ type: "external_blocked", message: "send_email_without_approval blocked" }],
    }];

    const result = await buildAgentQualityGates({ userId: "user_1" });

    expect(result.gates.find((gate) => gate.target === "OUTREACH")).toMatchObject({
      status: "blocked",
      blockedActions: 1,
      canScale: false,
    });
  });
});
