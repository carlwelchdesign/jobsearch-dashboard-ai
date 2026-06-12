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

describe("GET /api/applications/ready-for-extension", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    findApplicationsMock.mockReset();
    findApplicationsMock.mockResolvedValue([
      {
        id: "app_1",
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
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
          atsProvider: "greenhouse",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ],
    });
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
