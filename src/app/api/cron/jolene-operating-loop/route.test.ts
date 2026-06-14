import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJoleneOperatingLoopAgent } from "@/lib/jolene/operating-loop";
import { GET } from "./route";

vi.mock("@/lib/jolene/operating-loop", () => ({
  runJoleneOperatingLoopAgent: vi.fn(),
}));

const runLoopMock = vi.mocked(runJoleneOperatingLoopAgent);
const originalCronSecret = process.env.CRON_SECRET;

describe("GET /api/cron/jolene-operating-loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron_secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects requests without the configured cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/cron/jolene-operating-loop") as never);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(runLoopMock).not.toHaveBeenCalled();
  });

  it("runs the scheduled planner with a valid cron secret", async () => {
    runLoopMock.mockResolvedValue({
      run: { id: "loop_run_1", agentType: "JOLENE_OPERATING_LOOP", status: "COMPLETED" },
      output: { title: "Jolene Operating Loop", recommendedActions: [{ id: "a1" }], skippedActions: [], approvalRequests: [] },
    } as never);

    const response = await GET(new Request("http://localhost/api/cron/jolene-operating-loop", {
      headers: { authorization: "Bearer cron_secret" },
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runLoopMock).toHaveBeenCalledWith({ source: "scheduled" });
    expect(payload).toMatchObject({
      run: { id: "loop_run_1", agentType: "JOLENE_OPERATING_LOOP" },
      message: "Jolene Operating Loop planned 1 action(s).",
    });
  });
});
