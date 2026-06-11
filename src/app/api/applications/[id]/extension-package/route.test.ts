import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationAssistantPackageForId } from "@/lib/applications/assistant-package";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/applications/assistant-package", () => ({
  applicationAssistantPackageForId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    jobPosting: {
      update: vi.fn(),
    },
  },
}));

const packageForIdMock = vi.mocked(applicationAssistantPackageForId);
const findApplicationMock = vi.mocked(prisma.application.findUnique);
const updateJobPostingMock = vi.mocked(prisma.jobPosting.update);

describe("GET /api/applications/[id]/extension-package", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    packageForIdMock.mockReset();
    findApplicationMock.mockReset();
    updateJobPostingMock.mockReset();
    packageForIdMock.mockResolvedValue({
      status: 200,
      body: {
        application: { id: "app_1" },
        job: { applicationUrl: "https://jobs.acme.example/apply" },
      },
    } as Awaited<ReturnType<typeof applicationAssistantPackageForId>>);
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      jobPostingId: "job_1",
      jobPosting: {
        applicationUrl: "https://himalayas.app/jobs/123",
        rawData: { source: "search_query" },
      },
    } as unknown as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    updateJobPostingMock.mockResolvedValue({ id: "job_1" } as Awaited<ReturnType<typeof prisma.jobPosting.update>>);
  });

  it("updates the stored application URL before returning the selected package", async () => {
    const response = await GET(new Request("http://localhost/api/applications/app_1/extension-package?currentUrl=https%3A%2F%2Fjobs.acme.example%2Fapply"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(200);
    expect(updateJobPostingMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job_1" },
      data: expect.objectContaining({
        applicationUrl: "https://jobs.acme.example/apply",
        rawData: expect.objectContaining({
          source: "search_query",
          extensionSelectedFill: expect.objectContaining({
            previousUrl: "https://himalayas.app/jobs/123",
            applicationUrl: "https://jobs.acme.example/apply",
            source: "chrome_extension_selected_ready_application",
          }),
        }),
      }),
    }));
    expect(packageForIdMock).toHaveBeenCalledWith("app_1", "http://localhost");
    await expect(response.json()).resolves.toMatchObject({
      application: { id: "app_1" },
    });
  });

  it("requires the optional browser extension token when configured", async () => {
    vi.stubEnv("BROWSER_EXTENSION_TOKEN", "local-token");

    const response = await GET(new Request("http://localhost/api/applications/app_1/extension-package"), {
      params: { id: "app_1" },
    });

    expect(response.status).toBe(401);
    expect(packageForIdMock).not.toHaveBeenCalled();
    expect(updateJobPostingMock).not.toHaveBeenCalled();
  });

  it("returns 404 when currentUrl is provided for a missing application", async () => {
    findApplicationMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/applications/missing/extension-package?currentUrl=https%3A%2F%2Fjobs.acme.example%2Fapply"), {
      params: { id: "missing" },
    });

    expect(response.status).toBe(404);
    expect(updateJobPostingMock).not.toHaveBeenCalled();
    expect(packageForIdMock).not.toHaveBeenCalled();
  });
});
