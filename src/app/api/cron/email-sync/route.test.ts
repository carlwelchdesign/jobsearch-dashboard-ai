import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { syncJobResponseEmail } from "@/lib/email/sync";
import { GET } from "./route";

vi.mock("@/lib/email/sync", () => ({
  syncJobResponseEmail: vi.fn(),
}));

const syncJobResponseEmailMock = vi.mocked(syncJobResponseEmail);

describe("/api/cron/email-sync", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    syncJobResponseEmailMock.mockReset();
  });

  it("checks job response email", async () => {
    syncJobResponseEmailMock.mockResolvedValue({
      ok: true,
      scanned: 2,
      ingested: 1,
      skipped: 0,
      providers: [],
      watchlist: [],
      receivedConfirmations: [],
    });

    const response = await GET(new NextRequest("http://localhost/api/cron/email-sync?limit=10"));

    expect(syncJobResponseEmailMock).toHaveBeenCalledWith({ limit: 10, sinceDays: undefined });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "Email sync checked 2 message(s) and ingested 1." });
  });

  it("requires authorization when a sync secret is configured", async () => {
    vi.stubEnv("EMAIL_SYNC_SECRET", "secret");

    const response = await GET(new NextRequest("http://localhost/api/cron/email-sync"));

    expect(response.status).toBe(401);
    expect(syncJobResponseEmailMock).not.toHaveBeenCalled();
  });
});
