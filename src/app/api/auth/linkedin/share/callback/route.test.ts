import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLinkedInUserInfoToProfile, fetchLinkedInUserInfo } from "@/lib/linkedin/oidc";
import { exchangeLinkedInShareCodeForToken, saveLinkedInShareConnection } from "@/lib/linkedin/share";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/linkedin/oidc", () => ({
  applyLinkedInUserInfoToProfile: vi.fn(),
  fetchLinkedInUserInfo: vi.fn(),
}));

vi.mock("@/lib/linkedin/share", () => ({
  exchangeLinkedInShareCodeForToken: vi.fn(),
  saveLinkedInShareConnection: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const exchangeMock = vi.mocked(exchangeLinkedInShareCodeForToken);
const fetchInfoMock = vi.mocked(fetchLinkedInUserInfo);
const applyInfoMock = vi.mocked(applyLinkedInUserInfoToProfile);
const saveConnectionMock = vi.mocked(saveLinkedInShareConnection);

describe("/api/auth/linkedin/share/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    exchangeMock.mockResolvedValue({ access_token: "access_1", expires_in: 3600, scope: "openid profile email w_member_social" });
    fetchInfoMock.mockResolvedValue({ sub: "linkedin-subject", name: "LinkedIn Name" });
    applyInfoMock.mockResolvedValue({ id: "profile_1" } as never);
    saveConnectionMock.mockResolvedValue({ id: "share_1" } as never);
  });

  it("stores a LinkedIn publishing connection", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/share/callback?code=code_1&state=expected", {
      headers: { cookie: "linkedin_share_state=expected" },
    }));

    expect(exchangeMock).toHaveBeenCalledWith({ code: "code_1", origin: "http://localhost:3000" });
    expect(saveConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      accessToken: "access_1",
      scopes: "openid profile email w_member_social",
      linkedinSubject: "linkedin-subject",
    }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/linkedin-content");
  });
});
