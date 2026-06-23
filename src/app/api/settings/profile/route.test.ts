import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    userProfile: { update: vi.fn() },
  },
}));

const findFirstMock = vi.mocked(prisma.user.findFirst);
const updateMock = vi.mocked(prisma.userProfile.update);

describe("PATCH /api/settings/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue({
      id: "user_1",
      profile: { id: "profile_1", resumeFormat: "modern_two_column" },
    } as never);
  });

  it("saves the selected resume format", async () => {
    updateMock.mockResolvedValue({ id: "profile_1", resumeFormat: "swiss" } as never);

    const response = await PATCH(new Request("http://localhost/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ resumeFormat: "swiss" }),
    }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "profile_1" },
      data: { resumeFormat: "swiss" },
    }));
    await expect(response.json()).resolves.toMatchObject({ profile: { resumeFormat: "swiss" } });
  });

  it("rejects unsupported resume formats", async () => {
    const response = await PATCH(new Request("http://localhost/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ resumeFormat: "poster_mode" }),
    }));

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("preserves resume format when omitted", async () => {
    updateMock.mockResolvedValue({ id: "profile_1", linkedinUrl: "https://www.linkedin.com/in/carlwelch/" } as never);

    await PATCH(new Request("http://localhost/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ linkedinUrl: "https://www.linkedin.com/in/carlwelch/" }),
    }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { linkedinUrl: "https://www.linkedin.com/in/carlwelch/" },
    }));
  });
});
