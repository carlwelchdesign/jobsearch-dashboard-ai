import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workExperience: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findUniqueMock = vi.mocked(prisma.workExperience.findUnique);
const updateMock = vi.mocked(prisma.workExperience.update);

describe("PATCH /api/resumes/work-experiences/[id]/resume-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "work_1",
      resumeContext: {
        confirmedTech: [],
        versionSuggestions: [{
          id: "react:16-17",
          name: "React",
          suggestedVersion: "16-17",
          confidence: 0.56,
          rationale: "Estimated from role dates.",
          status: "NEEDS_REVIEW",
          source: "date_window",
          evidence: ["React"],
        }],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.workExperience.findUnique>>);
    updateMock.mockImplementation((async (input: unknown) => ({
      id: "work_1",
      resumeContext: (input as { data: { resumeContext: unknown } }).data.resumeContext,
    })) as never);
  });

  it("saves app context and confirmed tech", async () => {
    const response = await PATCH(new Request("http://localhost/api/resumes/work-experiences/work_1/resume-context", {
      method: "PATCH",
      body: JSON.stringify({
        applicationTitle: "Guided Selling Platform",
        applicationSummary: "Built sales engagement workflows for enterprise sales teams.",
        users: "sales teams",
        scaleImpact: "supported enterprise sales operations",
        confirmedTech: [{ name: "React", version: "17", source: "user_confirmed" }],
      }),
    }), { params: { id: "work_1" } });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work_1" },
      data: {
        resumeContext: expect.objectContaining({
          applicationTitle: "Guided Selling Platform",
          confirmedTech: [expect.objectContaining({ name: "React", version: "17" })],
        }),
      },
    }));
  });

  it("approves and rejects version suggestions with strict statuses", async () => {
    const response = await PATCH(new Request("http://localhost/api/resumes/work-experiences/work_1/resume-context", {
      method: "PATCH",
      body: JSON.stringify({
        versionSuggestions: [{
          id: "react:16-17",
          name: "React",
          suggestedVersion: "16-17",
          confidence: 0.56,
          rationale: "Estimated from role dates.",
          status: "APPROVED",
          source: "date_window",
          evidence: ["React"],
        }],
      }),
    }), { params: { id: "work_1" } });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        resumeContext: expect.objectContaining({
          versionSuggestions: [expect.objectContaining({ status: "APPROVED" })],
        }),
      },
    }));
  });

  it("rejects malformed suggestion statuses", async () => {
    const response = await PATCH(new Request("http://localhost/api/resumes/work-experiences/work_1/resume-context", {
      method: "PATCH",
      body: JSON.stringify({
        versionSuggestions: [{
          id: "react:16-17",
          name: "React",
          suggestedVersion: "16-17",
          confidence: 0.56,
          rationale: "Estimated from role dates.",
          status: "AUTO_APPROVED",
        }],
      }),
    }), { params: { id: "work_1" } });

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
