import { JoleneMessageRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationIntegrity } from "@/lib/applications/integrity";
import { executeJoleneConfirmation } from "@/lib/jolene/confirmation";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/agents/daily-command-center", () => ({
  runDailyCommandCenterAgent: vi.fn(),
}));

vi.mock("@/lib/agents/duplicate-stale-job-detector", () => ({
  runDuplicateStaleJobDetectorAgent: vi.fn(),
}));

vi.mock("@/lib/agents/graph-run-controls", () => ({
  controlGraphAgentRun: vi.fn(),
}));

vi.mock("@/lib/agents/market-intelligence", () => ({
  runMarketIntelligenceAgent: vi.fn(),
}));

vi.mock("@/lib/applications/integrity", () => ({
  repairApplicationIntegrity: vi.fn(),
}));

vi.mock("@/lib/jolene/email-ops", () => ({
  runJoleneEmailOperationsAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    joleneMessage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const findUniqueMock = vi.mocked(prisma.joleneMessage.findUnique);
const updateMock = vi.mocked(prisma.joleneMessage.update);
const createMock = vi.mocked(prisma.joleneMessage.create);
const transactionMock = vi.mocked(prisma.$transaction);
const repairMock = vi.mocked(repairApplicationIntegrity);

describe("executeJoleneConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repairMock.mockResolvedValue({
      before: { totalIssues: 1 },
      after: { totalIssues: 0 },
      repaired: 1,
      reconciliation: { archivedDuplicates: 0, syncedMatches: 1 },
    } as never);
    updateMock.mockResolvedValue(messageRecord("msg_1", { requiresConfirmation: false }) as never);
    createMock.mockResolvedValue(messageRecord("msg_2", { action: "jolene_confirmed_actions" }) as never);
    transactionMock.mockImplementation((async (items: Array<Promise<unknown>>) => Promise.all(items)) as never);
  });

  it("executes confirmed internal repair actions and updates the source message", async () => {
    findUniqueMock.mockResolvedValue(messageRecord("msg_1", {
      confirmationPlanId: "plan_1",
      requiresConfirmation: true,
      allowedExecution: "internal_repairs_only",
      expiresAt: "2099-01-01T00:00:00.000Z",
      plannedActions: [
        {
          id: "repair_application_integrity",
          label: "Repair application state",
          detail: "Repair drift.",
          risk: "guarded_mutation",
          status: "planned",
          executable: true,
        },
      ],
    }) as never);

    const result = await executeJoleneConfirmation({
      userId: "user_1",
      messageId: "msg_1",
      confirmationPlanId: "plan_1",
    });

    expect(repairMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "msg_1" },
      data: expect.objectContaining({
        actionJson: expect.objectContaining({
          requiresConfirmation: false,
          confirmedAt: expect.any(String),
          executedActions: [expect.objectContaining({ id: "repair_application_integrity", status: "executed" })],
        }),
      }),
    }));
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: JoleneMessageRole.ASSISTANT,
        content: expect.stringContaining("Confirmed"),
      }),
    }));
    expect(result.executedActions).toEqual([expect.objectContaining({ status: "executed" })]);
  });

  it("skips external actions inside the internal-repairs boundary", async () => {
    findUniqueMock.mockResolvedValue(messageRecord("msg_1", {
      confirmationPlanId: "plan_2",
      requiresConfirmation: true,
      allowedExecution: "internal_repairs_only",
      expiresAt: "2099-01-01T00:00:00.000Z",
      plannedActions: [
        {
          id: "external_submit_or_send",
          label: "Confirm external action",
          detail: "Would send a message.",
          risk: "external_manual_gate",
          status: "planned",
          executable: false,
        },
      ],
    }) as never);

    const result = await executeJoleneConfirmation({
      userId: "user_1",
      messageId: "msg_1",
      confirmationPlanId: "plan_2",
    });

    expect(repairMock).not.toHaveBeenCalled();
    expect(result.executedActions).toEqual([expect.objectContaining({ id: "external_submit_or_send", status: "skipped" })]);
  });
});

function messageRecord(id: string, actionJson: Record<string, unknown>) {
  return {
    id,
    conversationId: "conversation_1",
    role: JoleneMessageRole.ASSISTANT,
    content: "Confirm this plan.",
    contextJson: {},
    actionJson,
    createdAt: new Date("2026-05-19T12:00:00.000Z"),
    conversation: { id: "conversation_1", userId: "user_1" },
  };
}
