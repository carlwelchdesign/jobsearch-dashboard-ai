import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/reconciliation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/applications/reconciliation")>(),
  reconcileApplicationCanonicalState: vi.fn().mockResolvedValue({ inspected: 1, groups: 1, archivedDuplicates: 0, syncedMatches: 0 }),
}));

vi.mock("@/lib/jobs/suppression", () => ({
  clearJobSuppressionForApproval: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    jobProfileMatch: {
      update: vi.fn(),
    },
    application: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    applicationEvent: {
      create: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const updateMatchMock = vi.mocked(prisma.jobProfileMatch.update);
const findApplicationsMock = vi.mocked(prisma.application.findMany);
const findApplicationMock = vi.mocked(prisma.application.findFirst);
const createApplicationMock = vi.mocked(prisma.application.create);
const updateApplicationMock = vi.mocked(prisma.application.update);
const createEventMock = vi.mocked(prisma.applicationEvent.create);

describe("POST /api/jobs/[id]/approve", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    updateMatchMock.mockReset();
    findApplicationsMock.mockReset();
    findApplicationMock.mockReset();
    createApplicationMock.mockReset();
    updateApplicationMock.mockReset();
    createEventMock.mockReset();
  });

  it("approves a match and creates an application tracker", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    updateMatchMock.mockResolvedValue({
      id: "match_1",
      jobSearchProfile: { userId: "user_1" },
      jobPosting: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer", location: "Remote", lastSeenAt: new Date("2026-05-01"), duplicateGroupId: null },
    } as unknown as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    findApplicationsMock.mockResolvedValue([]);
    createApplicationMock.mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      jobPostingId: "job_1",
      jobProfileMatchId: "match_1",
      status: "approved",
    } as Awaited<ReturnType<typeof prisma.application.create>>);
    createEventMock.mockResolvedValue({ id: "event_1" } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);

    const response = await POST(new Request("http://localhost/api/jobs/job_1/approve", {
      method: "POST",
      body: JSON.stringify({ matchId: "match_1" }),
    }), {
      params: { id: "job_1" },
    });

    expect(updateMatchMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "match_1" },
      data: expect.objectContaining({ status: "approved" }),
    }));
    expect(createApplicationMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        jobPostingId: "job_1",
        jobProfileMatchId: "match_1",
        status: "approved",
      }),
    }));
    expect(createEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        applicationId: "app_1",
        type: "status_changed",
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job_1",
      application: { id: "app_1" },
      applicationUrl: "/applications/app_1",
    });
  });

  it("updates an existing application tracker without creating duplicate timeline events", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    updateMatchMock.mockResolvedValue({
      id: "match_1",
      jobSearchProfile: { userId: "user_1" },
      jobPosting: { id: "job_1", company: "Acme", title: "Senior Frontend Engineer", location: "Remote", lastSeenAt: new Date("2026-05-01"), duplicateGroupId: null },
    } as unknown as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_1",
        userId: "user_1",
        jobPostingId: "job_1",
        approvedAt: null,
        status: "approved",
        notes: "Existing note.",
        jobPosting: {
          company: "Acme",
          title: "Senior Frontend Engineer",
          location: "Remote",
          lastSeenAt: new Date("2026-05-01"),
        },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.application.findMany>>);
    updateApplicationMock.mockResolvedValue({
      id: "app_1",
      jobProfileMatchId: "match_1",
    } as Awaited<ReturnType<typeof prisma.application.update>>);

    const response = await POST(new Request("http://localhost/api/jobs/job_1/approve", {
      method: "POST",
      body: JSON.stringify({ matchId: "match_1" }),
    }), {
      params: { id: "job_1" },
    });

    expect(updateApplicationMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app_1" },
      data: expect.objectContaining({ jobProfileMatchId: "match_1" }),
    }));
    expect(createEventMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("rejects invalid approve payloads", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/job_1/approve", {
      method: "POST",
      body: JSON.stringify({ matchId: "" }),
    }), {
      params: { id: "job_1" },
    });

    expect(updateMatchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
