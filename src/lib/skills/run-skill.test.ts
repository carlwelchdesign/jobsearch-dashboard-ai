import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runSkill } from "@/lib/skills/run-skill";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    skillAdjustment: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/skills/registry", () => ({
  skillRegistry: {
    job_fit_scorer: {
      id: "job_fit_scorer",
      label: "Job fit scorer",
      agentType: "JOB_FIT_SCORER",
      riskLevel: "LOW",
      inputSchema: { parse: vi.fn((input) => input) },
      outputSchema: { parse: vi.fn((output) => output) },
      defaultPolicy: { mutatesLocalData: false, externalAction: "none", autoApplyLearningKinds: [] },
      execute: vi.fn(async () => ({ ok: true })),
    },
    prepare_application_packet: {
      id: "prepare_application_packet",
      label: "Prepare application packet",
      agentType: "APPLICATION_ASSISTANT",
      riskLevel: "HIGH",
      inputSchema: { parse: vi.fn((input) => input) },
      outputSchema: { parse: vi.fn((output) => output) },
      defaultPolicy: { mutatesLocalData: true, externalAction: "manual_submit_required", autoApplyLearningKinds: [] },
      execute: vi.fn(async () => ({ packet: "ready" })),
    },
  },
}));

const findAdjustmentsMock = vi.mocked(prisma.skillAdjustment.findMany);

describe("runSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAdjustmentsMock.mockResolvedValue([] as never);
  });

  it("loads only active adjustments for future skill runs", async () => {
    const result = await runSkill({ skillId: "job_fit_scorer", input: {}, userId: "user_1" });

    expect(findAdjustmentsMock).toHaveBeenCalledWith({
      where: { userId: "user_1", skillId: "job_fit_scorer", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    expect(result.policy).toMatchObject({ kind: "read_only", requiresApproval: false });
  });

  it("blocks high-risk skills until an explicit approval context is present", async () => {
    await expect(runSkill({
      skillId: "prepare_application_packet",
      input: { jobPostingId: "job_1" },
      userId: "user_1",
    })).rejects.toThrow("Guarded mutations require an explicit approval context");

    const result = await runSkill({
      skillId: "prepare_application_packet",
      input: { jobPostingId: "job_1" },
      userId: "user_1",
      approval: {
        approved: true,
        source: "test_approval",
        reason: "Manual packet preparation test approval.",
      },
    });

    expect(result.policy).toMatchObject({
      kind: "guarded_mutation",
      requiresApproval: true,
      approvedBy: "test_approval",
    });
  });
});
