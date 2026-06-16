import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSingleUser } from "@/lib/auth/single-user";
import { applyReadinessOverride, buildLifecycleReadiness } from "@/lib/readiness/lifecycle";
import { PATCH } from "./route";

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

vi.mock("@/lib/readiness/lifecycle", () => ({
  applyReadinessOverride: vi.fn(),
  buildLifecycleReadiness: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const applyOverrideMock = vi.mocked(applyReadinessOverride);
const buildReadinessMock = vi.mocked(buildLifecycleReadiness);

describe("PATCH /api/readiness/[key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    applyOverrideMock.mockResolvedValue(null);
    buildReadinessMock.mockResolvedValue({ userId: "user_1", items: [] } as never);
  });

  it("applies a readiness override for the protected user", async () => {
    const request = new Request("http://localhost/api/readiness/setup.profile", {
      method: "PATCH",
      body: JSON.stringify({ action: "dismiss", note: "Not relevant today" }),
    });

    const response = await PATCH(request, { params: { key: "setup.profile" } });

    expect(requireSingleUserMock).toHaveBeenCalledWith(request);
    expect(applyOverrideMock).toHaveBeenCalledWith({
      userId: "user_1",
      key: "setup.profile",
      action: "dismiss",
      snoozedUntil: undefined,
      note: "Not relevant today",
      metadata: undefined,
    });
    expect(response.status).toBe(200);
  });

  it("rejects invalid actions", async () => {
    const request = new Request("http://localhost/api/readiness/setup.profile", {
      method: "PATCH",
      body: JSON.stringify({ action: "ship_it" }),
    });

    const response = await PATCH(request, { params: { key: "setup.profile" } });

    expect(response.status).toBe(400);
    expect(applyOverrideMock).not.toHaveBeenCalled();
  });
});
