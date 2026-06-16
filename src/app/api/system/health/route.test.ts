import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    agentRun: { count: vi.fn() },
    jobSearchRun: { count: vi.fn() },
  },
}));

const queryRawMock = vi.mocked(prisma.$queryRaw);
const agentRunCountMock = vi.mocked(prisma.agentRun.count);
const jobSearchRunCountMock = vi.mocked(prisma.jobSearchRun.count);

describe("/api/system/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("EMAIL_SYNC_SECRET", "");
    vi.stubEnv("LINKEDIN_ANALYTICS_SYNC_SECRET", "");
    vi.stubEnv("REQUIRE_CRON_SECRETS", "");
    vi.stubEnv("VERCEL", "");
    queryRawMock.mockResolvedValue([{ ok: 1 }] as never);
    agentRunCountMock.mockResolvedValue(0);
    jobSearchRunCountMock.mockResolvedValue(0);
  });

  it("reports readiness checks", async () => {
    vi.stubEnv("CRON_SECRET", "cron_secret");
    vi.stubEnv("OPENAI_API_KEY", "openai_key");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "database", status: "pass" }),
        expect.objectContaining({ id: "cron-secret", status: "pass" }),
      ]),
    });
  });

  it("fails in production-like environments when required secrets are missing", async () => {
    vi.stubEnv("REQUIRE_CRON_SECRETS", "true");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "fail",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "cron-secret", status: "fail" }),
      ]),
    });
  });
});
