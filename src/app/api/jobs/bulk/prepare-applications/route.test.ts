import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobProfileMatch: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/jobs/suppression", () => ({
  isJobSuppressed: vi.fn(() => false),
  loadJobSuppressionStatesByUserIds: vi.fn(async () => new Map()),
}));

const preparePackageMock = vi.mocked(prepareApplicationPackage);
const matchFindManyMock = vi.mocked(prisma.jobProfileMatch.findMany);

describe("POST /api/jobs/bulk/prepare-applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchFindManyMock.mockResolvedValue([] as never);
  });

  it("rejects needs_review matches so bulk prepare cannot bypass agency approval", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/bulk/prepare-applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statuses: ["needs_review"] }),
    }));

    expect(response.status).toBe(400);
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(matchFindManyMock).not.toHaveBeenCalled();
  });

  it("defaults to already-approved matches only", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/bulk/prepare-applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minimumScore: 90, limit: 5 }),
    }));

    expect(response.status).toBe(200);
    expect(matchFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["approved"] },
      }),
    }));
  });

  it("skips approved matches whose application URLs are not direct launch targets", async () => {
    matchFindManyMock.mockResolvedValue([
      {
        id: "match_board",
        jobPostingId: "job_board",
        status: "approved",
        overallScore: 99,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        jobPosting: {
          id: "job_board",
          company: "Built In",
          title: "Frontend Engineer",
          location: "Remote",
          applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
          duplicateGroupId: null,
          lastSeenAt: null,
        },
        jobSearchProfile: { id: "profile_1", name: "Default", userId: "user_1" },
      },
      {
        id: "match_direct",
        jobPostingId: "job_direct",
        status: "approved",
        overallScore: 91,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        jobPosting: {
          id: "job_direct",
          company: "Linear",
          title: "Senior Frontend Engineer",
          location: "Remote",
          applicationUrl: "https://linear.app/apply",
          duplicateGroupId: null,
          lastSeenAt: null,
        },
        jobSearchProfile: { id: "profile_1", name: "Default", userId: "user_1" },
      },
    ] as never);
    preparePackageMock.mockResolvedValue({
      application: { id: "app_direct" },
      resume: { id: "resume_direct" },
      coverLetter: { id: "cover_direct" },
    } as Awaited<ReturnType<typeof prepareApplicationPackage>>);

    const response = await POST(new Request("http://localhost/api/jobs/bulk/prepare-applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minimumScore: 90, limit: 5 }),
    }));

    expect(response.status).toBe(200);
    expect(preparePackageMock).toHaveBeenCalledTimes(1);
    expect(preparePackageMock).toHaveBeenCalledWith("job_direct");
    await expect(response.json()).resolves.toMatchObject({
      eligible: 1,
      candidatesFound: 2,
      prepared: 1,
      results: [
        expect.objectContaining({
          matchId: "match_direct",
          jobId: "job_direct",
          applicationId: "app_direct",
        }),
      ],
    });
  });
});
