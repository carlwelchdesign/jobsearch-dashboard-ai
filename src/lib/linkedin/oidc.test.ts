import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLinkedInUserInfoToProfile, buildLinkedInOidcAuthorizeUrl, linkedInOidcConfig, linkedInOidcConfigured } from "@/lib/linkedin/oidc";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    userProfile: { update: vi.fn() },
  },
}));

const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const userUpdateMock = vi.mocked(prisma.user.update);
const userProfileUpdateMock = vi.mocked(prisma.userProfile.update);

describe("LinkedIn OIDC helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reports missing setup clearly", () => {
    expect(linkedInOidcConfigured()).toBe(false);
    expect(() => linkedInOidcConfig("http://localhost:3000")).toThrow("LINKEDIN_CLIENT_ID");
  });

  it("builds a LinkedIn OIDC authorization URL with openid profile email", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client_1");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret_1");

    const url = buildLinkedInOidcAuthorizeUrl({ state: "state_1", origin: "http://localhost:3000" });

    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client_1");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/linkedin/callback");
    expect(url.searchParams.get("state")).toBe("state_1");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
  });

  it("stores LinkedIn metadata without overwriting non-empty profile fields", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user_1",
      name: "Existing User",
      profile: {
        userId: "user_1",
        fullName: "Existing Full Name",
        email: "existing@example.com",
      },
    } as never);
    userProfileUpdateMock.mockResolvedValue({ id: "profile_1" } as never);

    await applyLinkedInUserInfoToProfile("user_1", {
      sub: "linkedin-subject",
      name: "LinkedIn Name",
      email: "linkedin@example.com",
      picture: "https://media.licdn.com/photo.jpg",
      locale: { language: "en", country: "US" },
      email_verified: true,
    });

    expect(userProfileUpdateMock).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: expect.objectContaining({
        linkedinSubject: "linkedin-subject",
        linkedinPictureUrl: "https://media.licdn.com/photo.jpg",
        linkedinLocale: "en_US",
        linkedinEmailVerified: true,
        linkedinConnectedAt: expect.any(Date),
      }),
    });
    expect(userProfileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        fullName: expect.any(String),
        email: expect.any(String),
      }),
    }));
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
