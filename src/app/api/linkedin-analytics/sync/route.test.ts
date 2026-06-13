import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncLinkedInPostAnalytics } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/linkedin/analytics", () => ({
  syncLinkedInPostAnalytics: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const syncMock = vi.mocked(syncLinkedInPostAnalytics);

describe("/api/linkedin-analytics/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    syncMock.mockResolvedValue({ posts: 1, snapshots: 4 });
  });

  it("syncs LinkedIn analytics through the shared service", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-analytics/sync", { method: "POST" }));

    expect(response.status).toBe(200);
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
