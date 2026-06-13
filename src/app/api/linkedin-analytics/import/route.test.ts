import { beforeEach, describe, expect, it, vi } from "vitest";
import { importLinkedInAnalyticsCsv } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/linkedin/analytics", () => ({
  importLinkedInAnalyticsCsv: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const importMock = vi.mocked(importLinkedInAnalyticsCsv);

describe("/api/linkedin-analytics/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    importMock.mockResolvedValue({ imported: 2 });
  });

  it("imports pasted LinkedIn analytics CSV", async () => {
    const response = await POST(new Request("http://localhost/api/linkedin-analytics/import", {
      method: "POST",
      body: JSON.stringify({ csv: "postUrn,impressions\nurn:li:ugcPost:1,10" }),
    }));

    expect(response.status).toBe(200);
    expect(importMock).toHaveBeenCalledWith("user_1", "postUrn,impressions\nurn:li:ugcPost:1,10");
    await expect(response.json()).resolves.toMatchObject({ imported: 2 });
  });
});
