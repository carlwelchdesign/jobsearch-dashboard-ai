import { describe, expect, it, vi } from "vitest";
import { syncJobResponseEmail } from "@/lib/email/sync";
import { startJobSearchRun } from "@/lib/job-search/start-run";
import { executeJoleneAction } from "@/lib/jolene/actions";

vi.mock("@/lib/email/sync", () => ({
  syncJobResponseEmail: vi.fn(),
}));

vi.mock("@/lib/job-search/start-run", () => ({
  startJobSearchRun: vi.fn(),
}));

vi.mock("@/lib/agents/duplicate-stale-job-detector", () => ({
  runDuplicateStaleJobDetectorAgent: vi.fn(),
}));

const syncJobResponseEmailMock = vi.mocked(syncJobResponseEmail);
const startJobSearchRunMock = vi.mocked(startJobSearchRun);

describe("executeJoleneAction", () => {
  it("checks email when the user asks Jolene to check Gmail", async () => {
    syncJobResponseEmailMock.mockResolvedValue({
      ok: true,
      scanned: 3,
      ingested: 2,
      skipped: 1,
      receivedConfirmations: [
        {
          applicationId: "app_1",
          company: "Acme",
          title: "Frontend Engineer",
          subject: "Thanks for applying",
          from: "talent@acme.example",
          receivedAt: new Date("2026-05-15T12:30:00.000Z"),
        },
      ],
      watchlist: [{
        applicationId: "app_1",
        company: "Acme",
        title: "Frontend Engineer",
        applicationUrl: null,
        appliedAt: new Date("2026-05-15T12:00:00.000Z"),
        updatedAt: new Date("2026-05-15T12:00:00.000Z"),
        gmailQueries: ["\"Acme\" newer_than:7d"],
      }],
      providers: [
        {
          ok: true,
          provider: "gmail",
          scanned: 3,
          ingested: 2,
          skipped: 1,
          queries: ["\"Acme\" newer_than:7d"],
          messages: [],
        },
      ],
    });

    const result = await executeJoleneAction("check my gmail for responses");

    expect(syncJobResponseEmailMock).toHaveBeenCalled();
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("against 1 active application");
    expect(result.reply).toContain("Application receipts recorded for: Acme");
    expect(result.actionJson).toMatchObject({ action: "check_email", scanned: 3, ingested: 2, watchedApplications: 1 });
    expect(result.clientAction).toEqual({ type: "navigate", href: "/applications", refresh: true });
  });

  it("still starts job search requests", async () => {
    startJobSearchRunMock.mockResolvedValue({
      started: true,
      skipped: false,
      reason: null,
      run: { id: "run_1" },
    } as never);

    const result = await executeJoleneAction("run a new search");

    expect(startJobSearchRunMock).toHaveBeenCalledWith("manual");
    expect(result.handled).toBe(true);
    expect(result.actionJson).toMatchObject({ action: "run_job_search", runId: "run_1" });
  });
});
