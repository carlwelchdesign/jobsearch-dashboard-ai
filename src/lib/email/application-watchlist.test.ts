import { describe, expect, it, vi } from "vitest";
import { buildEmailWatchlistFromApplications } from "@/lib/email/application-watchlist";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findMany: vi.fn(),
    },
  },
}));

const findManyMock = vi.mocked(prisma.application.findMany);

describe("buildEmailWatchlistFromApplications", () => {
  it("builds targeted Gmail queries from active applications", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "app_1",
        status: "applied",
        appliedAt: new Date("2026-05-10T12:00:00.000Z"),
        updatedAt: new Date("2026-05-11T12:00:00.000Z"),
        jobPosting: {
          company: "Acme AI",
          title: "Senior Frontend Platform Engineer",
          applicationUrl: "https://boards.greenhouse.io/acme/jobs/123",
        },
      },
    ] as never);

    const watchlist = await buildEmailWatchlistFromApplications({ id: "user_1" });

    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user_1" }),
    }));
    expect(watchlist).toHaveLength(1);
    expect(watchlist[0]?.gmailQueries).toEqual(expect.arrayContaining([
      expect.stringContaining("\"Acme AI\""),
      expect.stringContaining("from:boards.greenhouse.io"),
    ]));
  });
});
