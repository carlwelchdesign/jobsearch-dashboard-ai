import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRecruitingAgencyRunStatus, runRecruitingAgency } from "@/lib/applications/recruiting-agency";
import { POST } from "./route";
import { GET as GET_STATUS } from "./status/route";

vi.mock("@/lib/applications/recruiting-agency", () => ({
  runRecruitingAgency: vi.fn(),
  getRecruitingAgencyRunStatus: vi.fn(),
}));

const runRecruitingAgencyMock = vi.mocked(runRecruitingAgency);
const getRecruitingAgencyRunStatusMock = vi.mocked(getRecruitingAgencyRunStatus);

describe("/api/applications/agency/run", () => {
  beforeEach(() => {
    runRecruitingAgencyMock.mockReset();
    getRecruitingAgencyRunStatusMock.mockReset();
  });

  it("returns the agency run id with the final result", async () => {
    runRecruitingAgencyMock.mockResolvedValue({
      agentRunId: "agent_run_1",
      requested: { minimumScore: 90, limit: 10, triggeredBy: "manual" },
      approved: 1,
      prepared: 1,
      failed: 0,
      skipped: 9,
      results: [],
      message: "Recruiting agency prepared 1 application package from 1 approved match. 0 failed.",
    });

    const response = await POST(new NextRequest("http://localhost/api/applications/agency/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minimumScore: 90, limit: 10, triggeredBy: "manual" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ agentRunId: "agent_run_1" });
  });

  it("returns live agency run status", async () => {
    getRecruitingAgencyRunStatusMock.mockResolvedValue({
      id: "agent_run_1",
      status: "RUNNING",
      error: null,
      startedAt: "2026-05-16T21:00:00.000Z",
      updatedAt: "2026-05-16T21:00:01.000Z",
      totals: { found: 2, processed: 1, approved: 1, prepared: 1, failed: 0, skipped: 0 },
      current: { type: "packet_ready", message: "Packet ready for Acme.", payload: {} },
      events: [],
    });

    const response = await GET_STATUS(new NextRequest("http://localhost/api/applications/agency/run/status?runId=agent_run_1"));

    expect(getRecruitingAgencyRunStatusMock).toHaveBeenCalledWith({ runId: "agent_run_1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ run: { id: "agent_run_1", status: "RUNNING" } });
  });
});
