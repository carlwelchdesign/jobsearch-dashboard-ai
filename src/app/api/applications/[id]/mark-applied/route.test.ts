import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import { createQualityExampleFromAutomationRun } from "@/lib/observability/quality";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/outcomes", () => ({
  recordApplicationOutcome: vi.fn(),
}));

vi.mock("@/lib/observability/quality", () => ({
  createQualityExampleFromAutomationRun: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      update: vi.fn(),
    },
    applicationOutcome: {
      findFirst: vi.fn(),
    },
    applicationAutomationRun: {
      findFirst: vi.fn(),
    },
  },
}));

const findOutcomeMock = vi.mocked(prisma.applicationOutcome.findFirst);
const updateApplicationMock = vi.mocked(prisma.application.update);
const findAutomationRunMock = vi.mocked(prisma.applicationAutomationRun.findFirst);
const recordApplicationOutcomeMock = vi.mocked(recordApplicationOutcome);
const createQualityExampleMock = vi.mocked(createQualityExampleFromAutomationRun);

describe("POST /api/applications/[id]/mark-applied", () => {
  beforeEach(() => {
    findOutcomeMock.mockReset();
    updateApplicationMock.mockReset();
    findAutomationRunMock.mockReset();
    recordApplicationOutcomeMock.mockReset();
    createQualityExampleMock.mockReset();
  });

  it("records an applied outcome", async () => {
    findOutcomeMock.mockResolvedValue(null);
    findAutomationRunMock.mockResolvedValue(null);
    recordApplicationOutcomeMock.mockResolvedValue({
      outcome: { id: "outcome_1", outcome: "APPLIED" },
      status: "applied",
      message: "Applied recorded for Acme - Senior Frontend Engineer.",
    } as Awaited<ReturnType<typeof recordApplicationOutcome>>);

    const response = await POST(new Request("http://localhost/api/applications/app_1/mark-applied", {
      method: "POST",
    }), {
      params: { id: "app_1" },
    });

    expect(recordApplicationOutcomeMock).toHaveBeenCalledWith({
      applicationId: "app_1",
      outcome: "APPLIED",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: { id: "outcome_1", outcome: "APPLIED" },
    });
  });

  it("does not duplicate an existing applied outcome", async () => {
    findOutcomeMock.mockResolvedValue({
      id: "outcome_1",
      applicationId: "app_1",
      outcome: "APPLIED",
    } as Awaited<ReturnType<typeof prisma.applicationOutcome.findFirst>>);

    const response = await POST(new Request("http://localhost/api/applications/app_1/mark-applied", {
      method: "POST",
    }), {
      params: { id: "app_1" },
    });

    expect(recordApplicationOutcomeMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Application was already marked applied.",
    });
  });
});
