import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLinkedInUserInfoToProfile, exchangeLinkedInCodeForToken, fetchLinkedInUserInfo } from "@/lib/linkedin/oidc";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/linkedin/oidc", () => ({
  applyLinkedInUserInfoToProfile: vi.fn(),
  exchangeLinkedInCodeForToken: vi.fn(),
  fetchLinkedInUserInfo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const exchangeLinkedInCodeForTokenMock = vi.mocked(exchangeLinkedInCodeForToken);
const fetchLinkedInUserInfoMock = vi.mocked(fetchLinkedInUserInfo);
const applyLinkedInUserInfoToProfileMock = vi.mocked(applyLinkedInUserInfoToProfile);

describe("/api/auth/linkedin/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    exchangeLinkedInCodeForTokenMock.mockResolvedValue({ access_token: "access_1" });
    fetchLinkedInUserInfoMock.mockResolvedValue({ sub: "linkedin-subject", name: "LinkedIn Name" });
    applyLinkedInUserInfoToProfileMock.mockResolvedValue({ id: "profile_1" } as never);
  });

  it("rejects missing or invalid callback state", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/callback?code=code_1&state=bad", {
      headers: { cookie: "linkedin_oidc_state=expected" },
    }));

    expect(response.status).toBe(400);
    expect(exchangeLinkedInCodeForTokenMock).not.toHaveBeenCalled();
  });

  it("exchanges the code, reads userinfo, stores profile metadata, and clears state", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/callback?code=code_1&state=expected", {
      headers: { cookie: "linkedin_oidc_state=expected" },
    }));

    expect(exchangeLinkedInCodeForTokenMock).toHaveBeenCalledWith({ code: "code_1", origin: "http://localhost:3000" });
    expect(fetchLinkedInUserInfoMock).toHaveBeenCalledWith("access_1");
    expect(applyLinkedInUserInfoToProfileMock).toHaveBeenCalledWith("user_1", { sub: "linkedin-subject", name: "LinkedIn Name" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/settings/application#settings-profile-links");
    expect(response.headers.get("set-cookie")).toContain("linkedin_oidc_state=");
  });
});
