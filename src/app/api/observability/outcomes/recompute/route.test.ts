import { beforeEach, describe, expect, it, vi } from "vitest";
import { recomputeOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/observability/outcome-calibration", () => ({
  recomputeOutcomeCalibration: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const recomputeOutcomeCalibrationMock = vi.mocked(recomputeOutcomeCalibration);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/observability/outcomes/recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    recomputeOutcomeCalibrationMock.mockResolvedValue({
      createdExamples: 2,
      proposals: 1,
      summary: { applications: 4 },
      workflows: [],
      signals: [],
      details: { activeDuplicateGroups: [] },
    } as never);
  });

  it("recomputes outcome calibration and returns captured example counts", async () => {
    const response = await POST(new Request("http://localhost/api/observability/outcomes/recompute", { method: "POST" }));

    expect(recomputeOutcomeCalibrationMock).toHaveBeenCalledWith("user_1", { source: "settings_manual" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      createdExamples: 2,
      proposals: 1,
      details: { activeDuplicateGroups: [] },
    });
  });

  it("accepts an optional refresh source", async () => {
    const response = await POST(new Request("http://localhost/api/observability/outcomes/recompute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "assistant_state" }),
    }));

    expect(response.status).toBe(200);
    expect(recomputeOutcomeCalibrationMock).toHaveBeenCalledWith("user_1", { source: "assistant_state" });
  });
});
