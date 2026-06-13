import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveJoleneDelegatedWork, getLatestJoleneChiefBrief, runJoleneChiefOfStaffAgent } from "@/lib/jolene/chief-of-staff";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/jolene/chief-of-staff", () => ({
  approveJoleneDelegatedWork: vi.fn(),
  getLatestJoleneChiefBrief: vi.fn(),
  runJoleneChiefOfStaffAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

const userFindFirstMock = vi.mocked(prisma.user.findFirst);
const getLatestMock = vi.mocked(getLatestJoleneChiefBrief);
const runChiefMock = vi.mocked(runJoleneChiefOfStaffAgent);

describe("/api/jolene/chief-of-staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindFirstMock.mockResolvedValue({ id: "user_1" } as never);
  });

  it("returns the latest Jolene Chief brief", async () => {
    getLatestMock.mockResolvedValue({
      id: "run_1",
      agentType: "JOLENE_CHIEF_OF_STAFF",
      status: "COMPLETED",
      outputJson: { title: "Jolene, Chief of Staff", priorities: [], delegatedWork: [] },
      createdAt: new Date("2026-06-13T18:00:00.000Z"),
      updatedAt: new Date("2026-06-13T18:01:00.000Z"),
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(getLatestMock).toHaveBeenCalledWith("user_1");
    expect(payload).toMatchObject({
      run: { id: "run_1", agentType: "JOLENE_CHIEF_OF_STAFF", status: "COMPLETED" },
      brief: { title: "Jolene, Chief of Staff" },
    });
  });

  it("creates a new Jolene Chief run", async () => {
    runChiefMock.mockResolvedValue({
      run: {
        id: "run_2",
        agentType: "JOLENE_CHIEF_OF_STAFF",
        status: "COMPLETED",
        createdAt: new Date("2026-06-13T18:00:00.000Z"),
        updatedAt: new Date("2026-06-13T18:01:00.000Z"),
      },
      output: { title: "Jolene, Chief of Staff", priorities: [], delegatedWork: [] },
    } as never);

    const response = await POST();
    const payload = await response.json();

    expect(runChiefMock).toHaveBeenCalledWith({ userId: "user_1", source: "dashboard" });
    expect(payload).toMatchObject({
      message: "Jolene Chief of Staff brief generated.",
      run: { id: "run_2" },
      brief: { title: "Jolene, Chief of Staff" },
    });
  });
});

describe("approveJoleneDelegatedWork import guard", () => {
  it("keeps the approve service available for the nested route", () => {
    expect(approveJoleneDelegatedWork).toBeDefined();
  });
});
