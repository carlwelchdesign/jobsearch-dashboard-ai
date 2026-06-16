import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentQualityEvaluations } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/observability/quality", () => ({
  runAgentQualityEvaluations: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const runEvaluationsMock = vi.mocked(runAgentQualityEvaluations);
const userFindFirstMock = vi.mocked(prisma.user.findFirst);

describe("POST /api/observability/evaluations/run", () => {
  beforeEach(() => {
    runEvaluationsMock.mockReset();
    userFindFirstMock.mockReset();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    runEvaluationsMock.mockResolvedValue({
      scanned: 3,
      evaluated: 2,
      proposals: 1,
      targets: [{ target: "RECRUITING_AGENCY", scanned: 3, evaluated: 2, proposals: 1 }],
      evaluations: [],
    });
  });

  it("runs evaluations for the requested target", async () => {
    const response = await POST(new Request("http://localhost/api/observability/evaluations/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "RECRUITING_AGENCY" }),
    }));

    expect(runEvaluationsMock).toHaveBeenCalledWith({ userId: "user_1", target: "RECRUITING_AGENCY" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, scanned: 3, targets: [{ target: "RECRUITING_AGENCY" }] });
  });

  it("runs generated-material evaluations", async () => {
    const response = await POST(new Request("http://localhost/api/observability/evaluations/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "GENERATED_MATERIALS" }),
    }));

    expect(runEvaluationsMock).toHaveBeenCalledWith({ userId: "user_1", target: "GENERATED_MATERIALS" });
    expect(response.status).toBe(200);
  });

  it("rejects invalid targets", async () => {
    const response = await POST(new Request("http://localhost/api/observability/evaluations/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "OUTREACH" }),
    }));

    expect(response.status).toBe(400);
    expect(runEvaluationsMock).not.toHaveBeenCalled();
  });
});
