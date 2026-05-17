import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutcomeCalibration } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/observability/outcome-calibration", () => ({
  getOutcomeCalibration: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const getOutcomeCalibrationMock = vi.mocked(getOutcomeCalibration);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("GET /api/observability/outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    getOutcomeCalibrationMock.mockResolvedValue({
      summary: { applications: 1 },
      workflows: [{ target: "JOB_SEARCH", status: "healthy", score: 100, summary: "Clean", metrics: {} }],
      signals: [],
      details: { resurfacedSuppressedJobs: [{ jobId: "job_1" }] },
    } as never);
  });

  it("returns outcome calibration for the default user", async () => {
    const response = await GET();

    expect(getOutcomeCalibrationMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      summary: { applications: 1 },
      workflows: [{ target: "JOB_SEARCH" }],
      details: { resurfacedSuppressedJobs: [{ jobId: "job_1" }] },
    });
  });
});
