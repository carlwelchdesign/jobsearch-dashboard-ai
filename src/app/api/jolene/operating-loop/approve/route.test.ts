import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveJoleneOperatingLoopActions } from "@/lib/jolene/operating-loop";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/jolene/operating-loop", () => ({
  approveJoleneOperatingLoopActions: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const approveMock = vi.mocked(approveJoleneOperatingLoopActions);

describe("POST /api/jolene/operating-loop/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
  });

  it("approves selected proposed operating-loop actions", async () => {
    approveMock.mockResolvedValue({
      runId: "loop_run_1",
      executed: [{
        id: "loop_work_email_ops",
        actionId: "run_email_ops",
        label: "Run Email Ops",
        detail: "Started Email Ops.",
        href: "/dashboard/email-ops",
        risk: "approval_required",
        status: "executed",
        childRunId: "child_run_1",
      }],
      message: "Jolene Operating Loop executed 1 action.",
    } as never);

    const response = await POST(new Request("http://localhost/api/jolene/operating-loop/approve", {
      method: "POST",
      body: JSON.stringify({ runId: "loop_run_1", proposalIds: ["loop_work_email_ops"] }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith({
      userId: "user_1",
      runId: "loop_run_1",
      proposalIds: ["loop_work_email_ops"],
    });
    expect(payload).toMatchObject({
      runId: "loop_run_1",
      executed: [expect.objectContaining({ childRunId: "child_run_1", status: "executed" })],
    });
  });
});
