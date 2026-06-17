import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findMany: vi.fn(),
    },
  },
}));

const findApplicationsMock = vi.mocked(prisma.application.findMany);
const launchableMaterialQuality = {
  status: "PASS",
  launchable: true,
  reason: "Cover letter passed material quality review.",
  reasons: [],
  score: 92,
  generatedBy: "openai_structured_outputs",
  evidenceRefs: ["ev_1"],
};

describe("GET /api/applications/ready-for-extension", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    findApplicationsMock.mockReset();
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_1",
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_1",
          company: "Linear",
          title: "Senior Frontend Engineer",
          location: "Remote",
          description: "Build React and TypeScript product UI.",
          applicationUrl: "https://linear.app/apply",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: {
          overallScore: 94,
        },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.application.findMany>>);
  });

  it("returns ready applications with generated materials for the extension dropdown", async () => {
    const response = await GET(new Request("http://localhost/api/applications/ready-for-extension"));

    expect(response.status).toBe(200);
    expect(findApplicationsMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ready_to_apply",
        resumeId: { not: null },
        coverLetterId: { not: null },
        jobPosting: { applicationUrl: { not: null } },
      }),
      orderBy: [
        { updatedAt: "desc" },
        { jobProfileMatch: { overallScore: "desc" } },
      ],
      take: 200,
    }));
    await expect(response.json()).resolves.toEqual({
      applications: [
        {
          id: "app_1",
          jobPostingId: "job_1",
          company: "Linear",
          title: "Senior Frontend Engineer",
          location: "Remote",
          description: "Build React and TypeScript product UI.",
          score: 94,
          applicationUrl: "https://linear.app/apply",
          applicationUrlQuality: expect.objectContaining({
            launchable: true,
            kind: "direct",
            host: "linear.app",
          }),
          materialQuality: expect.objectContaining({
            launchable: true,
            status: "PASS",
          }),
          atsProvider: "greenhouse",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ],
    });
  });

  it("omits ready applications that only have board or intermediary URLs", async () => {
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_board",
        updatedAt: new Date("2026-06-02T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_board",
          company: "Built In",
          title: "Frontend Engineer",
          location: "Remote",
          description: "Board detail page.",
          applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
          atsProvider: "unknown",
        },
        jobProfileMatch: { overallScore: 99 },
      },
      {
        id: "app_direct",
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_direct",
          company: "Linear",
          title: "Senior Frontend Engineer",
          location: "Remote",
          description: "Build React and TypeScript product UI.",
          applicationUrl: "https://linear.app/apply",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: { overallScore: 94 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.application.findMany>>);

    const response = await GET(new Request("http://localhost/api/applications/ready-for-extension"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0]).toMatchObject({
      id: "app_direct",
      applicationUrl: "https://linear.app/apply",
    });
  });

  it("omits ready applications with blocked material quality", async () => {
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_weak",
        updatedAt: new Date("2026-06-02T12:00:00.000Z"),
        coverLetter: {
          generationNotes: {
            materialQuality: {
              status: "BLOCKED",
              launchable: false,
              reason: "Cover letter used deterministic fallback output and must be regenerated or reviewed before launch.",
              reasons: ["deterministic_fallback"],
              score: 40,
              generatedBy: "deterministic_fallback",
              evidenceRefs: [],
            },
          },
        },
        jobPosting: {
          id: "job_weak",
          company: "Linear",
          title: "Product Engineer",
          location: "Remote",
          description: "Build React and TypeScript product UI.",
          applicationUrl: "https://linear.app/apply",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: { overallScore: 98 },
      },
      {
        id: "app_direct",
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_direct",
          company: "Linear",
          title: "Senior Frontend Engineer",
          location: "Remote",
          description: "Build React and TypeScript product UI.",
          applicationUrl: "https://linear.app/apply",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: { overallScore: 94 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.application.findMany>>);

    const response = await GET(new Request("http://localhost/api/applications/ready-for-extension"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].id).toBe("app_direct");
  });


  it("requires the optional browser extension token when configured", async () => {
    vi.stubEnv("BROWSER_EXTENSION_TOKEN", "local-token");

    const response = await GET(new Request("http://localhost/api/applications/ready-for-extension"));

    expect(response.status).toBe(401);
    expect(findApplicationsMock).not.toHaveBeenCalled();
  });

  it("prioritizes the current tab URL when provided", async () => {
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_old",
        updatedAt: new Date("2026-06-02T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_old",
          company: "Older",
          title: "Older Role",
          location: "Remote",
          description: "Older role description.",
          applicationUrl: "https://jobs.example.com/form?gh_jid=111",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: { overallScore: 99 },
      },
      {
        id: "app_elastic",
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
        coverLetter: { generationNotes: { materialQuality: launchableMaterialQuality } },
        jobPosting: {
          id: "job_elastic",
          company: "Elastic",
          title: "Elastic AI Engineer",
          location: "Canada",
          description: "Build the search AI platform at Elastic.",
          applicationUrl: "https://jobs.elastic.co/form?gh_jid=7858138",
          atsProvider: "greenhouse",
        },
        jobProfileMatch: { overallScore: 84 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.application.findMany>>);

    const response = await GET(new Request("http://localhost/api/applications/ready-for-extension?currentUrl=https%3A%2F%2Fjobs.elastic.co%2Fform%3Fgh_jid%3D7858138"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applications[0]).toMatchObject({
      id: "app_elastic",
      company: "Elastic",
      description: "Build the search AI platform at Elastic.",
    });
  });
});
