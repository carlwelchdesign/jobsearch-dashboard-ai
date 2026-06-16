import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSingleUser } from "@/lib/auth/single-user";
import { buildLifecycleReadiness } from "@/lib/readiness/lifecycle";
import { GET } from "./route";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/readiness/lifecycle", () => ({
  buildLifecycleReadiness: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const buildReadinessMock = vi.mocked(buildLifecycleReadiness);

describe("GET /api/readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    buildReadinessMock.mockResolvedValue({ userId: "user_1", items: [] } as never);
  });

  it("returns protected single-user lifecycle readiness", async () => {
    const request = new Request("http://localhost/api/readiness");
    const response = await GET(request);

    expect(requireSingleUserMock).toHaveBeenCalledWith(request);
    expect(buildReadinessMock).toHaveBeenCalledWith({ userId: "user_1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ userId: "user_1" });
  });
});
