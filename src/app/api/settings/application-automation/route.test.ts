import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApplicationAutomationSettings, updateApplicationAutomationSettings } from "@/lib/applications/auto-submit-policy";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "./route";

vi.mock("@/lib/applications/auto-submit-policy", () => ({
  getApplicationAutomationSettings: vi.fn(),
  updateApplicationAutomationSettings: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const getSettingsMock = vi.mocked(getApplicationAutomationSettings);
const updateSettingsMock = vi.mocked(updateApplicationAutomationSettings);

describe("/api/settings/application-automation", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    getSettingsMock.mockReset();
    updateSettingsMock.mockReset();
  });

  it("returns automation settings for the current user", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    getSettingsMock.mockResolvedValue({ id: "settings_1", autoSubmitEnabled: false } as Awaited<ReturnType<typeof getApplicationAutomationSettings>>);

    const response = await GET();

    expect(getSettingsMock).toHaveBeenCalledWith("user_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ settings: { id: "settings_1", autoSubmitEnabled: false } });
  });

  it("updates gated auto-submit settings", async () => {
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
    updateSettingsMock.mockResolvedValue({ id: "settings_1", autoSubmitEnabled: true } as Awaited<ReturnType<typeof updateApplicationAutomationSettings>>);

    const response = await PATCH(new Request("http://localhost/api/settings/application-automation", {
      method: "PATCH",
      body: JSON.stringify({
        autoSubmitEnabled: true,
        requireApprovedPacket: true,
        requireNoOpenUserRequests: true,
        requireFreshAssistantRun: true,
        maxRunAgeMinutes: 20,
        allowDemographicSubmission: false,
      }),
    }));

    expect(updateSettingsMock).toHaveBeenCalledWith({
      userId: "user_1",
      autoSubmitEnabled: true,
      requireApprovedPacket: true,
      requireNoOpenUserRequests: true,
      requireFreshAssistantRun: true,
      maxRunAgeMinutes: 20,
      allowDemographicSubmission: false,
    });
    expect(response.status).toBe(200);
  });
});
