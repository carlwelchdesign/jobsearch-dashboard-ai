import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("/api/auth/linkedin/analytics/start", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects with the LinkedIn analytics scope", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client_1");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret_1");

    const response = await GET(new Request("http://localhost:3000/api/auth/linkedin/analytics/start"));
    const location = response.headers.get("location") ?? "";

    expect(response.status).toBe(307);
    expect(location).toContain("https://www.linkedin.com/oauth/v2/authorization");
    expect(location).toContain("r_member_postAnalytics");
    expect(response.headers.get("set-cookie")).toContain("linkedin_analytics_state=");
  });
});
