import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAiSettings, updateAiSettings } from "@/lib/settings/ai-settings";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "./route";

vi.mock("@/lib/settings/ai-settings", () => ({
  getAiSettings: vi.fn(),
  updateAiSettings: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const getAiSettingsMock = vi.mocked(getAiSettings);
const updateAiSettingsMock = vi.mocked(updateAiSettings);

describe("/api/settings/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserMock.mockResolvedValue({ id: "user_1" } as Awaited<ReturnType<typeof prisma.user.findFirst>>);
  });

  it("returns AI settings with the default LinkedIn content and diagram image models", async () => {
    getAiSettingsMock.mockResolvedValue({ id: "settings_1", userId: "user_1", linkedinContentModel: "gpt-5.5", linkedinDiagramImageModel: "gpt-image-2" } as Awaited<ReturnType<typeof getAiSettings>>);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getAiSettingsMock).toHaveBeenCalledWith("user_1");
    await expect(response.json()).resolves.toMatchObject({ settings: { linkedinContentModel: "gpt-5.5", linkedinDiagramImageModel: "gpt-image-2" } });
  });

  it("saves custom LinkedIn content and diagram image models", async () => {
    updateAiSettingsMock.mockResolvedValue({ id: "settings_1", userId: "user_1", linkedinContentModel: "gpt-5.4", linkedinDiagramImageModel: "gpt-image-2" } as Awaited<ReturnType<typeof updateAiSettings>>);

    const response = await PATCH(new Request("http://localhost/api/settings/ai", {
      method: "PATCH",
      body: JSON.stringify({ linkedinContentModel: "gpt-5.4", linkedinDiagramImageModel: "gpt-image-2" }),
    }));

    expect(response.status).toBe(200);
    expect(updateAiSettingsMock).toHaveBeenCalledWith({ userId: "user_1", linkedinContentModel: "gpt-5.4", linkedinDiagramImageModel: "gpt-image-2" });
    await expect(response.json()).resolves.toMatchObject({ settings: { linkedinContentModel: "gpt-5.4", linkedinDiagramImageModel: "gpt-image-2" } });
  });
});
