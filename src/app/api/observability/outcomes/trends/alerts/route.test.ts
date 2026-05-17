import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposeOutcomeTrendRegressionReviews } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/observability/outcome-calibration", () => ({
  proposeOutcomeTrendRegressionReviews: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const proposeOutcomeTrendRegressionReviewsMock = vi.mocked(proposeOutcomeTrendRegressionReviews);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/observability/outcomes/trends/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    proposeOutcomeTrendRegressionReviewsMock.mockResolvedValue({
      scanned: 2,
      created: 1,
      existing: 1,
      proposals: [
        { id: "proposal_1", trendKey: "metric:callbackRate", status: "created", proposalStatus: "PROPOSED", target: "RECRUITING_AGENCY" },
        { id: "proposal_2", trendKey: "workflow:JOB_SEARCH", status: "existing", proposalStatus: "PROPOSED", target: "JOB_SEARCH" },
      ],
    } as never);
  });

  it("creates regression review proposals for the default user", async () => {
    const response = await POST();

    expect(proposeOutcomeTrendRegressionReviewsMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      scanned: 2,
      created: 1,
      existing: 1,
    });
    expect(payload.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "proposal_1", trendKey: "metric:callbackRate" }),
    ]));
  });
});
