import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
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
    jobProfileMatch: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    skillAdjustment: {
      findMany: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const findApplicationsMock = vi.mocked(prisma.application.findMany);
const findApplicationMock = vi.mocked(prisma.application.findFirst);
const createApplicationMock = vi.mocked(prisma.application.create);
const updateApplicationMock = vi.mocked(prisma.application.update);
const createEventMock = vi.mocked(prisma.applicationEvent.create);
const findMatchesMock = vi.mocked(prisma.jobProfileMatch.findMany);
const findMatchMock = vi.mocked(prisma.jobProfileMatch.findUnique);
const updateMatchMock = vi.mocked(prisma.jobProfileMatch.update);
const findSkillAdjustmentsMock = vi.mocked(prisma.skillAdjustment.findMany);
const preparePackageMock = vi.mocked(prepareApplicationPackage);

describe("runRecruitingAgency", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    findApplicationsMock.mockReset();
    findApplicationMock.mockReset();
    createApplicationMock.mockReset();
    updateApplicationMock.mockReset();
    createEventMock.mockReset();
    findMatchesMock.mockReset();
    findMatchMock.mockReset();
    updateMatchMock.mockReset();
    findSkillAdjustmentsMock.mockReset();
    preparePackageMock.mockReset();
    findSkillAdjustmentsMock.mockResolvedValue([]);
  });

  it("auto-approves strong untracked matches and prepares application packages", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findApplicationsMock.mockResolvedValue([]);
    findApplicationMock.mockResolvedValue(null);
    const agencyMatch = match({ id: "match_1", jobPostingId: "job_1", score: 94, company: "Acme", title: "Senior Frontend Engineer" });
    findMatchesMock.mockResolvedValue([agencyMatch] as Awaited<ReturnType<typeof prisma.jobProfileMatch.findMany>>);
    findMatchMock.mockResolvedValue(agencyMatch as Awaited<ReturnType<typeof prisma.jobProfileMatch.findUnique>>);
    updateMatchMock.mockResolvedValue({ id: "match_1" } as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    createApplicationMock.mockResolvedValue({ id: "app_1" } as Awaited<ReturnType<typeof prisma.application.create>>);
    createEventMock.mockResolvedValue({ id: "event_1" } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);
    preparePackageMock.mockResolvedValue({
      application: { id: "app_1" },
      resume: { id: "resume_1" },
      coverLetter: { id: "cover_1" },
    } as Awaited<ReturnType<typeof prepareApplicationPackage>>);

    const result = await runRecruitingAgency({ minimumScore: 90, limit: 10 });

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
    expect(preparePackageMock).toHaveBeenCalledWith("job_1");
    expect(result).toMatchObject({ approved: 1, prepared: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({
      matchId: "match_1",
      applicationId: "app_1",
      status: "ready_to_apply",
    });
  });

  it("skips canonical duplicates that already have applications", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findApplicationsMock.mockResolvedValue([
      {
        status: "approved",
        jobPosting: {
          company: "Acme",
          title: "Senior Frontend Engineer",
          location: "Remote",
          lastSeenAt: new Date("2026-05-01"),
        },
      },
    ] as Awaited<ReturnType<typeof prisma.application.findMany>>);
    findMatchesMock.mockResolvedValue([
      match({ id: "match_1", jobPostingId: "job_1", score: 94, company: "Acme", title: "Senior Frontend Engineer", location: "Remote" }),
    ] as Awaited<ReturnType<typeof prisma.jobProfileMatch.findMany>>);

    const result = await runRecruitingAgency({ minimumScore: 90, limit: 10 });

    expect(updateMatchMock).not.toHaveBeenCalled();
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ approved: 0, prepared: 0, failed: 0 });
  });

  it("leaves approved applications visible when package preparation fails", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    findApplicationsMock.mockResolvedValue([]);
    const agencyMatch = match({ id: "match_1", jobPostingId: "job_1", score: 92, company: "Acme", title: "Senior Frontend Engineer" });
    findApplicationMock.mockResolvedValue({ id: "app_1" } as Awaited<ReturnType<typeof prisma.application.findFirst>>);
    findMatchesMock.mockResolvedValue([agencyMatch] as Awaited<ReturnType<typeof prisma.jobProfileMatch.findMany>>);
    findMatchMock.mockResolvedValue(agencyMatch as Awaited<ReturnType<typeof prisma.jobProfileMatch.findUnique>>);
    updateMatchMock.mockResolvedValue({ id: "match_1" } as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    createApplicationMock.mockResolvedValue({ id: "app_1" } as Awaited<ReturnType<typeof prisma.application.create>>);
    createEventMock.mockResolvedValue({ id: "event_1" } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);
    preparePackageMock.mockRejectedValue(new Error("No approved candidate profile."));

    const result = await runRecruitingAgency({ minimumScore: 90, limit: 10 });

    expect(createApplicationMock).toHaveBeenCalled();
    expect(result).toMatchObject({ approved: 1, prepared: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({
      matchId: "match_1",
      applicationId: "app_1",
      status: "failed",
      error: "No approved candidate profile.",
    });
  });
});

function match(input: {
  id: string;
  jobPostingId: string;
  score: number;
  company: string;
  title: string;
  location?: string | null;
}) {
  return {
    id: input.id,
    jobPostingId: input.jobPostingId,
    jobSearchProfileId: "profile_1",
    status: "needs_review",
    overallScore: input.score,
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-02"),
    jobPosting: {
      id: input.jobPostingId,
      company: input.company,
      title: input.title,
      location: input.location ?? "Remote",
      lastSeenAt: new Date("2026-05-01"),
      applicationUrl: "https://example.com/apply",
    },
    jobSearchProfile: { name: "Senior Frontend" },
  };
}
