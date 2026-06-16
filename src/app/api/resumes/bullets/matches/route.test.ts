import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workExperience: {
      findMany: vi.fn(),
    },
    experienceBullet: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const findManyMock = vi.mocked(prisma.workExperience.findMany);
const updateMock = vi.mocked(prisma.experienceBullet.update);
const transactionMock = vi.mocked(prisma.$transaction);

describe("POST /api/resumes/bullets/matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([
      { id: "work_1", company: "Revenue.io", title: "Senior Software Engineer" },
    ] as Awaited<ReturnType<typeof prisma.workExperience.findMany>>);
    updateMock.mockReturnValue({ id: "bullet_1" } as never);
    transactionMock.mockResolvedValue([{ id: "bullet_1" }] as never);
  });

  it("assigns matched bullets to the selected work experience", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/bullets/matches", {
      method: "POST",
      body: JSON.stringify({
        matches: [{ bulletId: "bullet_1", suggestedWorkExperienceId: "work_1" }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "bullet_1" },
      data: {
        workExperienceId: "work_1",
        company: "Revenue.io",
        role: "Senior Software Engineer",
      },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
