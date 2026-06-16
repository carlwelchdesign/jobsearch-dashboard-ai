import { AgentType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentRoster } from "@/lib/agents/roster";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentRun: {
      findMany: vi.fn(),
    },
  },
}));

const agentRunFindManyMock = vi.mocked(prisma.agentRun.findMany);

describe("buildAgentRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes every registered AgentType", async () => {
    agentRunFindManyMock.mockResolvedValue([] as never);

    const roster = await buildAgentRoster();

    expect(roster.map((item) => item.agentType).sort()).toEqual((Object.values(AgentType) as string[]).sort());
    expect(roster.find((item) => item.agentType === "LINKEDIN_CONTENT")).toEqual(expect.objectContaining({
      ownerArea: "Public content",
      actionPolicyKind: "proposal",
      sideEffects: ["none"],
    }));
  });

  it("shows policy tools, status, child runs, blocked actions, and latest eval", async () => {
    const createdAt = new Date("2026-06-16T10:00:00Z");
    agentRunFindManyMock.mockResolvedValue([
      {
        id: "run_parent",
        agentType: "RECRUITING_AGENCY",
        status: "RUNNING",
        createdAt,
        parentRunId: null,
        graphThreadId: "thread_1",
        events: [{ type: "approval_required", message: "External action blocked", createdAt }],
        qualityEvaluations: [{ score: 42, status: "FAILED", createdAt }],
      },
      {
        id: "run_child",
        agentType: "APPLICATION_QA",
        status: "COMPLETED",
        createdAt,
        parentRunId: "run_parent",
        graphThreadId: null,
        events: [],
        qualityEvaluations: [],
      },
    ] as never);

    const roster = await buildAgentRoster();
    const agency = roster.find((item) => item.agentType === "RECRUITING_AGENCY");

    expect(agency).toEqual(expect.objectContaining({
      runtime: "langgraph",
      approvalRequired: true,
      currentStatus: "RUNNING",
      childRuns: 1,
      blockedActions: 1,
      lastEvalScore: 42,
      lastEvalStatus: "FAILED",
    }));
    expect(agency?.allowedTools).toEqual(expect.arrayContaining(["prepare_manual_packet"]));
    expect(agency?.forbiddenActions).toEqual(expect.arrayContaining(["auto_submit"]));
    expect(agency?.sideEffects).toEqual(expect.arrayContaining(["approval_gate_required"]));
  });
});
