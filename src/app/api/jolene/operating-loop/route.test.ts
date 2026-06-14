import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestJoleneOperatingLoop, runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/jolene/operating-loop", () => ({
  getLatestJoleneOperatingLoop: vi.fn(),
  runJoleneOperatingLoopAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const getLatestMock = vi.mocked(getLatestJoleneOperatingLoop);
const runLoopMock = vi.mocked(runJoleneOperatingLoopAgent);

describe("/api/jolene/operating-loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
  });

  it("returns the latest operating loop plan", async () => {
    getLatestMock.mockResolvedValue({
      id: "run_1",
      agentType: "JOLENE_OPERATING_LOOP",
      status: "COMPLETED",
      outputJson: { title: "Jolene Operating Loop", recommendedActions: [], skippedActions: [], approvalRequests: [] },
      createdAt: new Date("2026-06-14T20:00:00.000Z"),
      updatedAt: new Date("2026-06-14T20:01:00.000Z"),
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getLatestMock).toHaveBeenCalledWith("user_1");
    expect(payload).toMatchObject({
      run: { id: "run_1", agentType: "JOLENE_OPERATING_LOOP", status: "COMPLETED" },
      loop: { title: "Jolene Operating Loop" },
    });
  });

  it("runs the planner from the dashboard", async () => {
    runLoopMock.mockResolvedValue({
      run: {
        id: "run_2",
        agentType: "JOLENE_OPERATING_LOOP",
        status: "COMPLETED",
        createdAt: new Date("2026-06-14T20:00:00.000Z"),
        updatedAt: new Date("2026-06-14T20:01:00.000Z"),
      },
      output: { title: "Jolene Operating Loop", recommendedActions: [], skippedActions: [], approvalRequests: [] },
    } as never);

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runLoopMock).toHaveBeenCalledWith({ userId: "user_1", source: "dashboard" });
    expect(payload).toMatchObject({
      message: "Jolene Operating Loop generated.",
      run: { id: "run_2" },
      loop: { title: "Jolene Operating Loop" },
    });
  });
});
