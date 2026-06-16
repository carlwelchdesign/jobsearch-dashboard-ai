import { beforeEach, describe, expect, it, vi } from "vitest";
import { startApplicationAssistantWorkflow } from "@/lib/applications/assistant-workflow-graph";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/assistant-workflow-graph", () => ({
  startApplicationAssistantWorkflow: vi.fn(),
}));

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobPosting: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findJobMock = vi.mocked(prisma.jobPosting.findUnique);
const updateJobMock = vi.mocked(prisma.jobPosting.update);
const preparePackageMock = vi.mocked(prepareApplicationPackage);
const startWorkflowMock = vi.mocked(startApplicationAssistantWorkflow);

describe("POST /api/jobs/[id]/apply-now", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    findJobMock.mockResolvedValue({ rawData: { captureSource: "Chrome Capture" } } as never);
    updateJobMock.mockResolvedValue({
      id: "job_1",
      company: "Acme",
      title: "Senior Frontend Engineer",
      applicationUrl: "https://jobs.acme.example/apply/123",
    } as never);
    preparePackageMock.mockResolvedValue({
      application: { id: "app_1" },
      resume: { id: "resume_1" },
      coverLetter: { id: "cover_1" },
    } as Awaited<ReturnType<typeof prepareApplicationPackage>>);
    startWorkflowMock.mockResolvedValue({
      ok: true,
      message: "Assistant launched.",
      manualSubmitRequired: true,
      application: {
        id: "app_1",
        company: "Acme",
        title: "Senior Frontend Engineer",
        applicationUrl: "https://jobs.acme.example/apply/123",
      },
    } as Awaited<ReturnType<typeof startApplicationAssistantWorkflow>>);
  });

  it("updates the saved job URL, prepares materials, and launches the assistant", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/job_1/apply-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applicationUrl: "https://jobs.acme.example/apply/123",
        pageUrl: "https://jobs.acme.example/apply/123",
        atsProvider: "greenhouse",
      }),
    }), { params: { id: "job_1" } });

    expect(response.status).toBe(200);
    expect(updateJobMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job_1" },
      data: expect.objectContaining({
        applicationUrl: "https://jobs.acme.example/apply/123",
        atsProvider: "greenhouse",
        rawData: expect.objectContaining({
          captureSource: "Chrome Capture",
          applyNow: expect.objectContaining({
            applicationUrl: "https://jobs.acme.example/apply/123",
          }),
        }),
      }),
    }));
    expect(preparePackageMock).toHaveBeenCalledWith("job_1");
    expect(startWorkflowMock).toHaveBeenCalledWith("app_1", "http://localhost");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      applicationId: "app_1",
      resumeId: "resume_1",
      coverLetterId: "cover_1",
      applicationUrl: "https://jobs.acme.example/apply/123",
      message: "Assistant launched.",
    });
  });

  it("requires the optional browser extension token when configured", async () => {
    vi.stubEnv("BROWSER_EXTENSION_TOKEN", "local-token");

    const response = await POST(new Request("http://localhost/api/jobs/job_1/apply-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applicationUrl: "https://jobs.acme.example/apply/123",
      }),
    }), { params: { id: "job_1" } });

    expect(response.status).toBe(401);
    expect(updateJobMock).not.toHaveBeenCalled();
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("rejects board URLs before updating the saved job", async () => {
    const response = await POST(new Request("http://localhost/api/jobs/job_1/apply-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
      }),
    }), { params: { id: "job_1" } });

    expect(response.status).toBe(400);
    expect(findJobMock).not.toHaveBeenCalled();
    expect(updateJobMock).not.toHaveBeenCalled();
    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(startWorkflowMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Direct application URL required"),
      applicationUrlQuality: expect.objectContaining({
        launchable: false,
        kind: "board_intermediary",
      }),
    });
  });

  it("returns 404 when the saved job is missing", async () => {
    findJobMock.mockResolvedValue(null as never);

    const response = await POST(new Request("http://localhost/api/jobs/missing/apply-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applicationUrl: "https://jobs.acme.example/apply/123",
      }),
    }), { params: { id: "missing" } });

    expect(response.status).toBe(404);
    expect(updateJobMock).not.toHaveBeenCalled();
  });
});
