import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutcomeRegressionTriage } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/observability/outcome-calibration", () => ({
  getOutcomeRegressionTriage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const getOutcomeRegressionTriageMock = vi.mocked(getOutcomeRegressionTriage);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("GET /api/observability/outcomes/trends/triage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    getOutcomeRegressionTriageMock.mockResolvedValue([
      {
        proposalId: "proposal_1",
        status: "PROPOSED",
        target: "APPLICATION_ASSISTANT",
        riskLevel: "HIGH",
        title: "Review assistant regression",
        summary: "Assistant failures increased.",
        priority: "high",
        ownerArea: "Application assistant",
        reviewHref: "/applications/assistant",
        reason: "Assistant quality regressed.",
        trendKey: "metric:assistantFailures",
        signalType: "assistant_quality",
        latestSnapshotId: "snapshot_1",
        latest: 3,
        previous: 1,
        delta: 2,
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
        updatedAt: new Date("2026-05-17T10:30:00.000Z"),
      },
    ] as never);
  });

  it("returns regression triage for the default user", async () => {
    const response = await GET();

    expect(getOutcomeRegressionTriageMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      triage: [
        {
          proposalId: "proposal_1",
          priority: "high",
          reviewHref: "/applications/assistant",
        },
      ],
    });
  });
});
