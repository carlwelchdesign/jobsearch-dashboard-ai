import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateCustomOpportunityResume } from "@/lib/resumes/custom-opportunity";
import { POST } from "./route";

vi.mock("@/lib/resumes/custom-opportunity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resumes/custom-opportunity")>();
  return {
    ...actual,
    generateCustomOpportunityResume: vi.fn(),
  };
});

const generateMock = vi.mocked(generateCustomOpportunityResume);

describe("POST /api/resumes/custom-opportunity/generate", () => {
  beforeEach(() => {
    generateMock.mockReset();
  });

  it("generates a saved resume for provided opportunity fields", async () => {
    generateMock.mockResolvedValue({
      job: { id: "job_1" },
      match: { id: "match_1" },
      resume: { id: "resume_1", plainText: "Generated resume body.", markdown: "Generated resume body." },
      inferredDetails: {
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote",
        remoteType: "remote",
        applicationUrl: null,
      },
      jobUrl: "/jobs/job_1",
      resumeId: "resume_1",
      pdfUrl: "/api/resumes/generated/resume_1/pdf",
      textUrl: "/api/resumes/generated/resume_1/plain-text",
      resumePreview: "Generated resume body.",
      warnings: [],
    } as unknown as Awaited<ReturnType<typeof generateCustomOpportunityResume>>);

    const response = await POST(new Request("http://localhost/api/resumes/custom-opportunity/generate", {
      method: "POST",
      body: JSON.stringify({
        description: "Recruiter note for a Senior Frontend Engineer role at Acme focused on React and TypeScript.",
        company: "Acme",
        title: "Senior Frontend Engineer",
        remoteType: "remote",
      }),
    }));

    expect(response.status).toBe(201);
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      company: "Acme",
      title: "Senior Frontend Engineer",
      remoteType: "remote",
    }));
    await expect(response.json()).resolves.toMatchObject({
      resumeId: "resume_1",
      jobUrl: "/jobs/job_1",
      pdfUrl: "/api/resumes/generated/resume_1/pdf",
      textUrl: "/api/resumes/generated/resume_1/plain-text",
      message: "Custom opportunity resume generated.",
    });
  });

  it("rejects empty recruiter briefs", async () => {
    const response = await POST(new Request("http://localhost/api/resumes/custom-opportunity/generate", {
      method: "POST",
      body: JSON.stringify({ description: "" }),
    }));

    expect(response.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
