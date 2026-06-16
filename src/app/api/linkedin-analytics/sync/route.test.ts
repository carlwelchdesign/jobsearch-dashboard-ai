import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSingleUser } from "@/lib/auth/single-user";
import { syncLinkedInPostAnalytics } from "@/lib/linkedin/analytics";
import { POST } from "./route";

vi.mock("@/lib/linkedin/analytics", () => ({
  syncLinkedInPostAnalytics: vi.fn(),
}));

vi.mock("@/lib/auth/single-user", () => ({
  requireSingleUser: vi.fn(),
}));

const requireSingleUserMock = vi.mocked(requireSingleUser);
const syncMock = vi.mocked(syncLinkedInPostAnalytics);

describe("/api/linkedin-analytics/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("LINKEDIN_ANALYTICS_SYNC_SECRET", "");
    vi.stubEnv("REQUIRE_CRON_SECRETS", "");
    vi.stubEnv("VERCEL", "");
    requireSingleUserMock.mockResolvedValue({ id: "user_1" } as never);
    syncMock.mockResolvedValue({ posts: 1, snapshots: 4 });
  });

  it("syncs LinkedIn analytics through the shared service", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-analytics/sync", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(requireSingleUserMock).toHaveBeenCalled();
    expect(syncMock).toHaveBeenCalledWith("user_1");
    await expect(response.json()).resolves.toMatchObject({ posts: 1, snapshots: 4 });
  });

  it("rejects invalid cron authorization when a sync secret is configured", async () => {
    vi.stubEnv("LINKEDIN_ANALYTICS_SYNC_SECRET", "secret_1");

    const response = await POST(new Request("http://localhost/api/linkedin-analytics/sync", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));

    expect(response.status).toBe(401);
    expect(syncMock).not.toHaveBeenCalled();
  });
});
