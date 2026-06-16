import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { GET } from "./route";

vi.mock("@/lib/applications/recruiting-agency", () => ({
  runRecruitingAgency: vi.fn(),
}));

const runRecruitingAgencyMock = vi.mocked(runRecruitingAgency);

describe("/api/cron/recruiting-agency", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("RECRUITING_AGENCY_SECRET", "");
    vi.stubEnv("REQUIRE_CRON_SECRETS", "");
    vi.stubEnv("VERCEL", "");
    runRecruitingAgencyMock.mockReset();
  });

  it("runs the recruiting agency with cron settings", async () => {
    runRecruitingAgencyMock.mockResolvedValue({
      agentRunId: "agent_run_1",
      requested: { minimumScore: 92, limit: 5, triggeredBy: "cron" },
      approved: 3,
      prepared: 2,
      failed: 1,
      skipped: 2,
      results: [],
      message: "Original runner message.",
    });

    const response = await GET(new NextRequest("http://localhost/api/cron/recruiting-agency?minimumScore=92&limit=5"));

    expect(runRecruitingAgencyMock).toHaveBeenCalledWith({ minimumScore: 92, limit: 5, triggeredBy: "cron" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Recruiting agency cron prepared 2 package(s), approved 3, and failed 1.",
    });
  });

  it("requires authorization when a recruiting agency secret is configured", async () => {
    vi.stubEnv("RECRUITING_AGENCY_SECRET", "secret");

    const response = await GET(new NextRequest("http://localhost/api/cron/recruiting-agency"));

    expect(response.status).toBe(401);
    expect(runRecruitingAgencyMock).not.toHaveBeenCalled();
  });
});
