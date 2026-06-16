import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSingleUser } from "@/lib/auth/single-user";
import { buildAgentQualityGates } from "@/lib/agents/quality-gates";
import { GET } from "./route";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/agents/quality-gates", () => ({
  buildAgentQualityGates: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const buildGatesMock = vi.mocked(buildAgentQualityGates);

describe("GET /api/agents/quality-gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    buildGatesMock.mockResolvedValue({ userId: "user_1", gates: [], total: 0 } as never);
  });

  it("returns quality gates for the protected user", async () => {
    const request = new Request("http://localhost/api/agents/quality-gates");
    const response = await GET(request);

    expect(requireSingleUserMock).toHaveBeenCalledWith(request);
    expect(buildGatesMock).toHaveBeenCalledWith({ userId: "user_1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ userId: "user_1" });
  });
});
