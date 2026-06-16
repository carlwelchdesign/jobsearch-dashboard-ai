import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workExperience: {
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    experienceBullet: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const findManyMock = vi.mocked(prisma.workExperience.findMany);
const workUpdateMock = vi.mocked(prisma.workExperience.update);
const workDeleteManyMock = vi.mocked(prisma.workExperience.deleteMany);
const bulletUpdateManyMock = vi.mocked(prisma.experienceBullet.updateMany);
const transactionMock = vi.mocked(prisma.$transaction);

describe("POST /api/resumes/work-experiences/merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([
      {
        id: "work_1",
        userProfileId: "profile_1",
        company: "Revenue.io",
        title: "Senior Software Engineer",
        location: null,
        startDate: "Jan 2021",
        endDate: "Dec 2023",
        isCurrent: false,
        summary: "Built guided selling workflows.",
        skills: ["React"],
        achievements: [],
        resumeContext: {
          confirmedTech: [{ name: "React", version: "17", source: "user_confirmed" }],
          versionSuggestions: [],
        },
      },
      {
        id: "work_2",
        userProfileId: "profile_1",
        company: "revenue io",
        title: "Senior Software Engineer",
        location: "San Francisco",
        startDate: "2021",
        endDate: "2023",
        isCurrent: false,
        summary: null,
        skills: ["TypeScript"],
        achievements: ["Improved delivery"],
        resumeContext: {
          applicationSummary: "Supported enterprise sales teams.",
          confirmedTech: [{ name: "TypeScript", source: "user_confirmed" }],
          versionSuggestions: [],
        },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.workExperience.findMany>>);
    bulletUpdateManyMock.mockReturnValue({ count: 1 } as never);
    workUpdateMock.mockReturnValue({ id: "work_1" } as never);
    workDeleteManyMock.mockReturnValue({ count: 1 } as never);
    transactionMock.mockResolvedValue([{ count: 1 }, { count: 1 }, { id: "work_1" }, { count: 1 }] as never);
  });

  it("reassigns bullets, merges context, and deletes reviewed duplicate work rows", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/work-experiences/merge", {
      method: "POST",
      body: JSON.stringify({
        canonicalWorkExperienceId: "work_1",
        duplicateWorkExperienceIds: ["work_2"],
      }),
    }));

    expect(response.status).toBe(200);
    expect(bulletUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { workExperienceId: { in: ["work_2"] } },
      data: expect.objectContaining({ workExperienceId: "work_1" }),
    }));
    expect(workUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work_1" },
      data: expect.objectContaining({
        skills: ["React", "TypeScript"],
        achievements: ["Improved delivery"],
        resumeContext: expect.objectContaining({
          applicationSummary: "Supported enterprise sales teams.",
          confirmedTech: expect.arrayContaining([
            expect.objectContaining({ name: "React" }),
            expect.objectContaining({ name: "TypeScript" }),
          ]),
        }),
      }),
    }));
    expect(workDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ["work_2"] } } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
