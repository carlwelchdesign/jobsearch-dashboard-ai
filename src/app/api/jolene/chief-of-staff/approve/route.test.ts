import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveJoleneDelegatedWork } from "@/lib/jolene/chief-of-staff";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/jolene/chief-of-staff", () => ({
  approveJoleneDelegatedWork: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const approveMock = vi.mocked(approveJoleneDelegatedWork);

describe("POST /api/jolene/chief-of-staff/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
  });

  it("executes only selected delegated work proposals", async () => {
    approveMock.mockResolvedValue({
      runId: "run_1",
      executed: [{ id: "proposal_run_market_intelligence", actionId: "run_market_intelligence", label: "Refresh Market Intelligence", detail: "Done", href: "/dashboard/market", risk: "approval_required", status: "executed", childRunId: "child_1" }],
      message: "Jolene executed 1 delegated action.",
    } as never);

    const response = await POST(new Request("http://localhost/api/jolene/chief-of-staff/approve", {
      method: "POST",
      body: JSON.stringify({ runId: "run_1", proposalIds: ["proposal_run_market_intelligence"] }),
    }));
    const payload = await response.json();

    expect(approveMock).toHaveBeenCalledWith({
      userId: "user_1",
      runId: "run_1",
      proposalIds: ["proposal_run_market_intelligence"],
    });
    expect(payload).toMatchObject({
      runId: "run_1",
      executed: [expect.objectContaining({ childRunId: "child_1", status: "executed" })],
    });
  });
});
