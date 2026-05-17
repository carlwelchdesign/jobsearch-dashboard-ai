import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DELETE } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    jobProfileMatch: {
      update: vi.fn(),
    },
    skillFeedback: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
  },
}));

const findApplicationMock = vi.mocked(prisma.application.findUnique);
const deleteApplicationMock = vi.mocked(prisma.application.delete);
const updateMatchMock = vi.mocked(prisma.jobProfileMatch.update);
const createSkillFeedbackMock = vi.mocked(prisma.skillFeedback.create);
const transactionMock = vi.mocked(prisma.$transaction);

describe("DELETE /api/applications/[id]", () => {
  beforeEach(() => {
    findApplicationMock.mockReset();
    deleteApplicationMock.mockReset();
    updateMatchMock.mockReset();
    createSkillFeedbackMock.mockReset();
    transactionMock.mockClear();
    deleteApplicationMock.mockResolvedValue({ id: "app_1" } as Awaited<ReturnType<typeof prisma.application.delete>>);
    updateMatchMock.mockResolvedValue({ id: "match_1", status: "rejected" } as Awaited<ReturnType<typeof prisma.jobProfileMatch.update>>);
    createSkillFeedbackMock.mockResolvedValue({ id: "feedback_1" } as Awaited<ReturnType<typeof prisma.skillFeedback.create>>);
  });

  it("marks the linked match rejected and records agency learning feedback", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      userId: "user_1",
      jobPostingId: "job_1",
      status: "ready_to_apply",
      jobProfileMatchId: "match_1",
      jobPosting: {
        company: "Acme",
        title: "Senior Engineer",
        location: "Remote",
      },
    } as Awaited<ReturnType<typeof prisma.application.findUnique>>);

    const response = await DELETE(new Request("http://localhost/api/applications/app_1"), { params: { id: "app_1" } });

    expect(createSkillFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user_1",
        skillId: "approve_agency_match",
        applicationId: "app_1",
        jobPostingId: "job_1",
        problemSummary: expect.stringContaining("not a good fit"),
      }),
    }));
    expect(updateMatchMock).toHaveBeenCalledWith({
      where: { id: "match_1" },
      data: expect.objectContaining({ status: "rejected" }),
    });
    expect(deleteApplicationMock).toHaveBeenCalledWith({ where: { id: "app_1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: true, rejected: true });
  });
});
