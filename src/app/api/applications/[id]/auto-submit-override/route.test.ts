import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/applications/auto-submit-policy", () => ({
  evaluateAutoSubmitEligibility: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      update: vi.fn(),
    },
  },
}));

const updateApplicationMock = vi.mocked(prisma.application.update);
const evaluateEligibilityMock = vi.mocked(evaluateAutoSubmitEligibility);

describe("/api/applications/[id]/auto-submit-override", () => {
  beforeEach(() => {
    updateApplicationMock.mockReset();
    evaluateEligibilityMock.mockReset();
  });

  it("updates a per-application auto-submit override", async () => {
    updateApplicationMock.mockResolvedValue({ id: "app_1", autoSubmitOverride: true } as Awaited<ReturnType<typeof prisma.application.update>>);
    evaluateEligibilityMock.mockResolvedValue({
      allowed: false,
      reasons: ["Application packet must be approved."],
      effectiveAutoSubmitEnabled: true,
      override: true,
      settings: {
        autoSubmitEnabled: false,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 30,
        allowDemographicSubmission: false,
      },
    });

    const response = await PATCH(new Request("http://localhost/api/applications/app_1/auto-submit-override", {
      method: "PATCH",
      body: JSON.stringify({ autoSubmitOverride: true }),
    }), { params: { id: "app_1" } });

    expect(updateApplicationMock).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { autoSubmitOverride: true },
      select: {
        id: true,
        autoSubmitOverride: true,
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Auto-submit override enabled for this application. Safety gates still apply.",
      eligibility: { effectiveAutoSubmitEnabled: true },
    });
  });

  it("clears the override back to inherited settings", async () => {
    updateApplicationMock.mockResolvedValue({ id: "app_1", autoSubmitOverride: null } as Awaited<ReturnType<typeof prisma.application.update>>);
    evaluateEligibilityMock.mockResolvedValue({
      allowed: false,
      reasons: ["Auto-submit is disabled in settings."],
      effectiveAutoSubmitEnabled: false,
      override: null,
      settings: {
        autoSubmitEnabled: false,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 30,
        allowDemographicSubmission: false,
      },
    });

    const response = await PATCH(new Request("http://localhost/api/applications/app_1/auto-submit-override", {
      method: "PATCH",
      body: JSON.stringify({ autoSubmitOverride: null }),
    }), { params: { id: "app_1" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Auto-submit override cleared. This application now inherits global settings.",
    });
  });
});
