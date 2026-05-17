import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposeOutcomeReviewActionImprovements } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/observability/outcome-calibration", () => ({
  proposeOutcomeReviewActionImprovements: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const proposeOutcomeReviewActionImprovementsMock = vi.mocked(proposeOutcomeReviewActionImprovements);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/observability/outcomes/propose-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    proposeOutcomeReviewActionImprovementsMock.mockResolvedValue({
      scanned: 3,
      created: 2,
      existing: 1,
      proposals: [
        { id: "proposal_1", actionId: "source:source_1", status: "created" },
        { id: "proposal_2", actionId: "duplicate:dup_1", status: "existing" },
      ],
    } as never);
  });

  it("creates proposals from outcome review actions", async () => {
    const response = await POST();

    expect(proposeOutcomeReviewActionImprovementsMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      scanned: 3,
      created: 2,
      existing: 1,
      proposals: [
        { id: "proposal_1", actionId: "source:source_1", status: "created" },
        { id: "proposal_2", actionId: "duplicate:dup_1", status: "existing" },
      ],
    });
  });
});
