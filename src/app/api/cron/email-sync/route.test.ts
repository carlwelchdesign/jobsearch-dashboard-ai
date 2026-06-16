import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { GET } from "./route";

vi.mock("@/lib/jolene/email-ops", () => ({
  runJoleneEmailOperationsAgent: vi.fn(),
}));

const runEmailOpsMock = vi.mocked(runJoleneEmailOperationsAgent);

describe("/api/cron/email-sync", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("EMAIL_SYNC_SECRET", "");
    vi.stubEnv("REQUIRE_CRON_SECRETS", "");
    vi.stubEnv("VERCEL", "");
    runEmailOpsMock.mockReset();
  });

  it("checks job response email through Email Ops", async () => {
    runEmailOpsMock.mockResolvedValue({
      run: { id: "run_1", agentType: "JOLENE_EMAIL_OPERATIONS", status: "COMPLETED" },
      output: {
        title: "Jolene Email Operations",
        scanned: 2,
        ingested: 1,
        findingsCreated: 1,
      },
    } as Awaited<ReturnType<typeof runJoleneEmailOperationsAgent>>);

    const response = await GET(new NextRequest("http://localhost/api/cron/email-sync?limit=10"));

    expect(runEmailOpsMock).toHaveBeenCalledWith({ source: "scheduled", limit: 10, sinceDays: undefined });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "Email Ops checked 2 message(s), ingested 1, and created 1 finding(s)." });
  });

  it("requires authorization when a sync secret is configured", async () => {
    vi.stubEnv("EMAIL_SYNC_SECRET", "secret");

    const response = await GET(new NextRequest("http://localhost/api/cron/email-sync"));

    expect(response.status).toBe(401);
    expect(runEmailOpsMock).not.toHaveBeenCalled();
  });
});
