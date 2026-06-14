import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/jolene/email-ops/route";
import { POST as RUN } from "@/app/api/jolene/email-ops/run/route";
import { POST as APPROVE } from "@/app/api/jolene/email-ops/findings/[id]/approve/route";
import { POST as DISMISS } from "@/app/api/jolene/email-ops/findings/[id]/dismiss/route";
import { approveEmailOpsFinding, dismissEmailOpsFinding, getLatestEmailOpsSummary, runJoleneEmailOperationsAgent } from "@/lib/jolene/email-ops";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/jolene/email-ops", () => ({
  getLatestEmailOpsSummary: vi.fn(),
  runJoleneEmailOperationsAgent: vi.fn(),
  approveEmailOpsFinding: vi.fn(),
  dismissEmailOpsFinding: vi.fn(),
}));

const findUserMock = vi.mocked(prisma.user.findFirst);
const getLatestMock = vi.mocked(getLatestEmailOpsSummary);
const runMock = vi.mocked(runJoleneEmailOperationsAgent);
const approveMock = vi.mocked(approveEmailOpsFinding);
const dismissMock = vi.mocked(dismissEmailOpsFinding);

describe("Jolene Email Ops API routes", () => {
  beforeEach(() => {
    findUserMock.mockReset();
    getLatestMock.mockReset();
    runMock.mockReset();
    approveMock.mockReset();
    dismissMock.mockReset();
    findUserMock.mockResolvedValue({ id: "user_1", createdAt: new Date(), updatedAt: new Date(), email: "user@example.com", name: null });
  });

  it("returns latest Email Ops summary and pending work", async () => {
    getLatestMock.mockResolvedValue({
      latestRun: { id: "run_1", agentType: "JOLENE_EMAIL_OPERATIONS", status: "COMPLETED", createdAt: new Date("2026-06-14T10:00:00.000Z"), updatedAt: new Date("2026-06-14T10:01:00.000Z") },
      summary: { title: "Jolene Email Operations", findingsCreated: 1, backfill: { enabled: true, lookbackDays: 90, processed: 12 } },
      findings: [{ id: "finding_1" }],
      pendingCalendarProposals: [{ id: "calendar_1" }],
      providerHealth: [{ provider: "gmail", ok: false, status: "NEEDS_REAUTH", detail: "Reconnect Gmail.", lastSyncAt: null, actionRequired: "Reconnect Gmail in Settings." }],
    } as Awaited<ReturnType<typeof getLatestEmailOpsSummary>>);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getLatestMock).toHaveBeenCalledWith("user_1");
    expect(payload.summary).toMatchObject({ title: "Jolene Email Operations" });
    expect(payload.providerHealth).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "gmail", status: "NEEDS_REAUTH" })]));
    expect(payload.backfill).toMatchObject({ lookbackDays: 90, processed: 12 });
    expect(payload.findings).toHaveLength(1);
  });

  it("runs Email Ops from the dashboard route", async () => {
    runMock.mockResolvedValue({
      run: { id: "run_1", agentType: "JOLENE_EMAIL_OPERATIONS", status: "COMPLETED", createdAt: new Date("2026-06-14T10:00:00.000Z"), updatedAt: new Date("2026-06-14T10:01:00.000Z") },
      output: { title: "Jolene Email Operations", scanned: 5, findingsCreated: 2 },
    } as Awaited<ReturnType<typeof runJoleneEmailOperationsAgent>>);

    const response = await RUN(new Request("http://localhost/api/jolene/email-ops/run", {
      method: "POST",
      body: JSON.stringify({ limit: 5, sinceDays: 7, lookbackDays: 90, includeBackfill: true, providerMode: "backfill_only" }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_1", source: "dashboard", limit: 5, sinceDays: 7, lookbackDays: 90, includeBackfill: true, providerMode: "backfill_only" }));
    expect(payload.message).toContain("Email Operations");
  });

  it("approves and dismisses findings by id", async () => {
    approveMock.mockResolvedValue({ finding: { id: "finding_1", status: "APPROVED" }, message: "approved" } as Awaited<ReturnType<typeof approveEmailOpsFinding>>);
    dismissMock.mockResolvedValue({ finding: { id: "finding_2", status: "DISMISSED" }, message: "dismissed" } as Awaited<ReturnType<typeof dismissEmailOpsFinding>>);

    const approveResponse = await APPROVE(new Request("http://localhost"), { params: { id: "finding_1" } });
    const dismissResponse = await DISMISS(new Request("http://localhost"), { params: { id: "finding_2" } });

    expect(approveResponse.status).toBe(200);
    expect(dismissResponse.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith({ userId: "user_1", findingId: "finding_1" });
    expect(dismissMock).toHaveBeenCalledWith({ userId: "user_1", findingId: "finding_2" });
  });
});
