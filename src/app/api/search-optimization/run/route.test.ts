import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRecruitingSearchOptimization } from "@/lib/agents/recruiting-search-optimization";
import { requireSingleUser } from "@/lib/auth/single-user";
import { POST } from "./route";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/agents/recruiting-search-optimization", () => ({
  runRecruitingSearchOptimization: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const runOptimizationMock = vi.mocked(runRecruitingSearchOptimization);

describe("POST /api/search-optimization/run", () => {
  beforeEach(() => {
    requireSingleUserMock.mockReset();
    runOptimizationMock.mockReset();
    requireSingleUserMock.mockResolvedValue({ id: "user_1", email: "person@example.com", name: null, createdAt: new Date(), updatedAt: new Date() });
    runOptimizationMock.mockResolvedValue({
      output: { optimizationRunId: "optimization_1", changes: [] },
    } as never);
  });

  it("runs the recruiting search optimization team for the protected user", async () => {
    const response = await POST(new Request("http://localhost/api/search-optimization/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "active" }),
    }));

    expect(response.status).toBe(202);
    expect(runOptimizationMock).toHaveBeenCalledWith({ userId: "user_1", mode: "active" });
  });

  it("rejects invalid modes", async () => {
    const response = await POST(new Request("http://localhost/api/search-optimization/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "delete_everything" }),
    }));

    expect(response.status).toBe(400);
    expect(runOptimizationMock).not.toHaveBeenCalled();
  });
});
