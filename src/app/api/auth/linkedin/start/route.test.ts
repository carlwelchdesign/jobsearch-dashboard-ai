import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("/api/auth/linkedin/start", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a setup error when LinkedIn OIDC env vars are missing", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "");

    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/start"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("LINKEDIN_CLIENT_ID"),
    });
  });

  it("redirects to LinkedIn and sets the state cookie", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client_1");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret_1");

    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/start"));
    const location = response.headers.get("location") ?? "";
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location).toContain("https://www.linkedin.com/oauth/v2/authorization");
    expect(location).toContain("scope=openid+profile+email");
    expect(cookie).toContain("linkedin_oidc_state=");
    expect(cookie).toContain("HttpOnly");
  });
});
