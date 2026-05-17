import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillAgentQualityExamples } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/observability/quality", () => ({
  backfillAgentQualityExamples: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const backfillMock = vi.mocked(backfillAgentQualityExamples);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/observability/examples/backfill", () => {
  beforeEach(() => {
    backfillMock.mockReset();
    userFindFirstMock.mockReset();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    backfillMock.mockResolvedValue({
      scanned: 4,
      examples: 2,
      targets: [{ target: "JOB_MATCHING", scanned: 4, examples: 2 }],
    });
  });

  it("backfills examples for the requested target", async () => {
    const response = await POST(new Request("http://localhost/api/observability/examples/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "JOB_MATCHING" }),
    }));

    expect(backfillMock).toHaveBeenCalledWith({ userId: "user_1", target: "JOB_MATCHING" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, examples: 2, targets: [{ target: "JOB_MATCHING" }] });
  });
});
