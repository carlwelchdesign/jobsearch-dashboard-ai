import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/applications/prepare-package", () => ({
  prepareApplicationPackage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    applicationEvent: { create: vi.fn() },
  },
}));

const findApplicationMock = vi.mocked(prisma.application.findUnique);
const createEventMock = vi.mocked(prisma.applicationEvent.create);
const preparePackageMock = vi.mocked(prepareApplicationPackage);

describe("POST /api/applications/[id]/regenerate-materials", () => {
  beforeEach(() => {
    findApplicationMock.mockReset();
    createEventMock.mockReset();
    preparePackageMock.mockReset();
  });

  it("regenerates resume and cover letter for the application job", async () => {
    findApplicationMock.mockResolvedValue({
      id: "app_1",
      jobPostingId: "job_1",
      resumeId: "old_resume",
      coverLetterId: "old_letter",
    } as Awaited<ReturnType<typeof prisma.application.findUnique>>);
    preparePackageMock.mockResolvedValue({
      resume: { id: "new_resume" },
      coverLetter: { id: "new_letter" },
      readyToApply: true,
      materialQuality: { launchable: true, status: "PASS" },
    } as Awaited<ReturnType<typeof prepareApplicationPackage>>);
    createEventMock.mockResolvedValue({ id: "event_1" } as Awaited<ReturnType<typeof prisma.applicationEvent.create>>);

    const response = await POST(new Request("http://localhost/api/applications/app_1/regenerate-materials"), {
      params: { id: "app_1" },
    });

    expect(preparePackageMock).toHaveBeenCalledWith("job_1", {
      regenerateResume: true,
      regenerateCoverLetter: true,
    });
    expect(createEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        applicationId: "app_1",
        type: "note_added",
        payload: expect.objectContaining({
          previousResumeId: "old_resume",
          previousCoverLetterId: "old_letter",
          resumeId: "new_resume",
          coverLetterId: "new_letter",
          manualSubmissionRequired: true,
        }),
      }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      applicationId: "app_1",
      resumeId: "new_resume",
      coverLetterId: "new_letter",
      message: "Regenerated resume and cover letter. Review the refreshed materials before using them.",
    });
  });

  it("returns not found when the application does not exist", async () => {
    findApplicationMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/applications/missing/regenerate-materials"), {
      params: { id: "missing" },
    });

    expect(preparePackageMock).not.toHaveBeenCalled();
    expect(createEventMock).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Application not found." });
  });
});
