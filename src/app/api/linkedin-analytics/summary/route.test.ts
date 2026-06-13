import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLinkedInAnalyticsSummary } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/linkedin/analytics", () => ({
  getLinkedInAnalyticsSummary: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const summaryMock = vi.mocked(getLinkedInAnalyticsSummary);

describe("/api/linkedin-analytics/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    summaryMock.mockResolvedValue({ range: "30d", kpis: { impressions: 10 } } as never);
  });

  it("returns dashboard-ready LinkedIn analytics summary", async () => {
    const response = await GET(new Request("http://localhost/api/linkedin-analytics/summary?range=90d"));

    expect(response.status).toBe(200);
    expect(summaryMock).toHaveBeenCalledWith("user_1", "90d");
    await expect(response.json()).resolves.toMatchObject({ range: "30d", kpis: { impressions: 10 } });
  });

  it("falls back to 30d for unsupported ranges", async () => {
    await GET(new Request("http://localhost/api/linkedin-analytics/summary?range=all"));

    expect(summaryMock).toHaveBeenCalledWith("user_1", "30d");
  });
});
