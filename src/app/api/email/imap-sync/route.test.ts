import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncImapEmail } from "@/lib/email/imap-sync";
import { POST } from "./route";

vi.mock("@/lib/email/imap-sync", () => ({
  imapConfigFromEnv: vi.fn(() => ({
    host: "imap.example.com",
    port: 993,
    secure: true,
    user: "candidate@example.com",
    pass: "secret",
    mailbox: "INBOX",
    limit: 25,
    sinceDays: 14,
    unseenOnly: false,
  })),
  syncImapEmail: vi.fn(),
}));

const syncImapEmailMock = vi.mocked(syncImapEmail);

describe("/api/email/imap-sync", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    syncImapEmailMock.mockReset();
  });

  it("runs the IMAP sync connector", async () => {
    syncImapEmailMock.mockResolvedValue({
      ok: true,
      provider: "imap",
      mailbox: "INBOX",
      scanned: 1,
      ingested: 1,
      suppressed: 0,
      skipped: 0,
      suppressionReasons: [],
      messages: [],
    });

    const response = await POST(new Request("http://localhost/api/email/imap-sync", {
      method: "POST",
      body: JSON.stringify({ limit: 5 }),
    }));

    expect(syncImapEmailMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "Synced 1 email message(s)." });
  });

  it("requires authorization when EMAIL_SYNC_SECRET is configured", async () => {
    vi.stubEnv("EMAIL_SYNC_SECRET", "secret");

    const response = await POST(new Request("http://localhost/api/email/imap-sync", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(401);
    expect(syncImapEmailMock).not.toHaveBeenCalled();
  });
});
