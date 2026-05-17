import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptImprovementProposal } from "@/lib/observability/quality";
import { POST } from "./route";

vi.mock("@/lib/observability/quality", () => ({
  acceptImprovementProposal: vi.fn(),
}));

const acceptImprovementProposalMock = vi.mocked(acceptImprovementProposal);

describe("POST /api/observability/proposals/[id]/accept", () => {
  beforeEach(() => {
    acceptImprovementProposalMock.mockReset();
    acceptImprovementProposalMock.mockResolvedValue({
      proposal: { id: "proposal_1", status: "ACCEPTED" },
      activation: {
        status: "created",
        adjustmentId: "adjustment_1",
        skillId: "job_fit_scorer",
        kind: "GUIDANCE",
        reason: "Accepted low-risk proposal activated as skill guidance.",
      },
    } as never);
  });

  it("returns proposal activation metadata", async () => {
    const response = await POST(new Request("http://localhost/api/observability/proposals/proposal_1/accept", { method: "POST" }), {
      params: { id: "proposal_1" },
    });

    expect(acceptImprovementProposalMock).toHaveBeenCalledWith("proposal_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      proposal: { id: "proposal_1", status: "ACCEPTED" },
      activation: { status: "created", adjustmentId: "adjustment_1", skillId: "job_fit_scorer" },
    });
  });
});
