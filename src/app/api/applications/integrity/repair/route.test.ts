import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairApplicationIntegrity } from "@/lib/applications/integrity";
import { POST } from "./route";

vi.mock("@/lib/applications/integrity", () => ({
  repairApplicationIntegrity: vi.fn(),
}));

const repairMock = vi.mocked(repairApplicationIntegrity);

describe("POST /api/applications/integrity/repair", () => {
  beforeEach(() => {
    repairMock.mockReset();
  });

  it("repairs deterministic application state drift", async () => {
    repairMock.mockResolvedValue({
      before: report(2),
      after: report(0),
      repaired: 2,
      reconciliation: { archivedDuplicates: 1, syncedMatches: 1 },
      transitions: { count: 1, eventIds: ["event_1"] },
    });

    const response = await POST();

    expect(repairMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      repaired: 2,
      transitions: { count: 1, eventIds: ["event_1"] },
      message: "Repaired 2 application state issues.",
    });
  });
});

function report(totalIssues: number) {
  return {
    generatedAt: "2026-05-17T12:00:00.000Z",
    totalIssues,
    issueCounts: {
      STALE_DUPLICATE_APPLICATION: 0,
      MATCH_STATUS_DRIFT: 0,
      EMAIL_CONFIRMED_PENDING_APPLICATION: 0,
      RESURFACED_SUBMITTED_JOB: 0,
      ASSISTANT_SUBMITTED_STATUS_DRIFT: 0,
    },
    visibleApplications: 2,
    issues: [],
  };
}
