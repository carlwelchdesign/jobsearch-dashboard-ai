import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLearningImpact } from "@/lib/observability/learning-impact";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/observability/learning-impact", () => ({
  getLearningImpact: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const getLearningImpactMock = vi.mocked(getLearningImpact);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("GET /api/observability/learning-impact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    getLearningImpactMock.mockResolvedValue([
      { adjustmentId: "adjustment_1", status: "helping" },
      { adjustmentId: "adjustment_2", status: "needs_review" },
      { adjustmentId: "adjustment_3", status: "insufficient_data" },
    ] as never);
  });

  it("returns learning impact with a status summary", async () => {
    const response = await GET();

    expect(getLearningImpactMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      impact: [
        { adjustmentId: "adjustment_1", status: "helping" },
        { adjustmentId: "adjustment_2", status: "needs_review" },
        { adjustmentId: "adjustment_3", status: "insufficient_data" },
      ],
      summary: {
        total: 3,
        helping: 1,
        needsReview: 1,
        insufficientData: 1,
      },
    });
  });
});
