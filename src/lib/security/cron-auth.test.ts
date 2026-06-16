import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBearerSecret } from "@/lib/security/cron-auth";

describe("requireBearerSecret", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("REQUIRE_CRON_SECRETS", "");
    vi.stubEnv("VERCEL", "");
  });

  it("allows local requests when no secret is configured", () => {
    const response = requireBearerSecret(new Request("http://localhost/api/cron/job-search"), {
      envNames: ["CRON_SECRET"],
      label: "Job search cron",
    });

    expect(response).toBeNull();
  });

  it("fails closed when required secrets are missing", async () => {
    vi.stubEnv("REQUIRE_CRON_SECRETS", "true");

    const response = requireBearerSecret(new Request("http://localhost/api/cron/job-search"), {
      envNames: ["CRON_SECRET"],
      label: "Job search cron",
    });

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Job search cron secret is not configured.",
    });
  });

  it("requires a bearer token when a secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "secret_1");

    const rejected = requireBearerSecret(new Request("http://localhost/api/cron/job-search"), {
      envNames: ["CRON_SECRET"],
      label: "Job search cron",
    });
    const accepted = requireBearerSecret(new Request("http://localhost/api/cron/job-search", {
      headers: { authorization: "Bearer secret_1" },
    }), {
      envNames: ["CRON_SECRET"],
      label: "Job search cron",
    });

    expect(rejected?.status).toBe(401);
    await expect(rejected?.json()).resolves.toMatchObject({ error: "Unauthorized" });
    expect(accepted).toBeNull();
  });
});
