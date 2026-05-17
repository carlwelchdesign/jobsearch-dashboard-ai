import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureJobRejectionLearning } from "@/lib/jobs/rejection-learning";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/jobs/rejection-learning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/rejection-learning")>()),
  captureJobRejectionLearning: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const captureMock = vi.mocked(captureJobRejectionLearning);

describe("POST /api/jobs/rejection-feedback", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    captureMock.mockReset();
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    captureMock.mockResolvedValue({ created: 2 });
  });

  it("records after-the-fact rejection reasons", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/rejection-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: "match_1",
        jobPostingId: "job_1",
        reasons: ["wrong_seniority"],
        note: "Too junior.",
      }),
    }));

    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      matchId: "match_1",
      jobPostingId: "job_1",
      reasons: ["wrong_seniority"],
      note: "Too junior.",
      previousStatus: "rejected",
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, created: 2 });
  });
});
