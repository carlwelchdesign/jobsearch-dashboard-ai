import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLinkedInUserInfoToProfile, fetchLinkedInUserInfo } from "@/lib/linkedin/oidc";
import { exchangeLinkedInAnalyticsCodeForToken, saveLinkedInAnalyticsConnection } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/linkedin/oidc", () => ({
  applyLinkedInUserInfoToProfile: vi.fn(),
  fetchLinkedInUserInfo: vi.fn(),
}));

vi.mock("@/lib/linkedin/analytics", () => ({
  exchangeLinkedInAnalyticsCodeForToken: vi.fn(),
  saveLinkedInAnalyticsConnection: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const exchangeMock = vi.mocked(exchangeLinkedInAnalyticsCodeForToken);
const fetchInfoMock = vi.mocked(fetchLinkedInUserInfo);
const applyInfoMock = vi.mocked(applyLinkedInUserInfoToProfile);
const saveConnectionMock = vi.mocked(saveLinkedInAnalyticsConnection);

describe("/api/auth/linkedin/analytics/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
    exchangeMock.mockResolvedValue({ access_token: "access_1", expires_in: 3600, scope: "openid profile email r_member_postAnalytics" });
    fetchInfoMock.mockResolvedValue({ sub: "linkedin-subject", name: "LinkedIn Name" });
    applyInfoMock.mockResolvedValue({ id: "profile_1" } as never);
    saveConnectionMock.mockResolvedValue({ id: "analytics_1" } as never);
  });

  it("stores a LinkedIn analytics connection", async () => {
    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/analytics/callback?code=code_1&state=expected", {
      headers: { cookie: "linkedin_analytics_state=expected" },
    }));

    expect(exchangeMock).toHaveBeenCalledWith({ code: "code_1", origin: "http://localhost:3000" });
    expect(saveConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      accessToken: "access_1",
      scopes: "openid profile email r_member_postAnalytics",
      linkedinSubject: "linkedin-subject",
    }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard?linkedinAnalytics=connected");
  });
});
