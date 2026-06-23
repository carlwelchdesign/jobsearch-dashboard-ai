import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUploadedResume } from "@/lib/ai/resume";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/ai/resume", () => ({
  parseUploadedResume: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resumeUpload: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const parseUploadedResumeMock = vi.mocked(parseUploadedResume);

describe("POST /api/resumes/uploads/[id]/reparse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-parses upload text without approving or creating profile evidence", async () => {
    const parsedJson = parsedResume();
    vi.mocked(prisma.resumeUpload.findUnique).mockResolvedValue({
      id: "upload_1",
      extractedText: "SUMMARY\nSenior engineer.\nPROFESSIONAL EXPERIENCE\nYubico - Senior Software Engineer | Jul 2022 - Mar 2026",
    } as Awaited<ReturnType<typeof prisma.resumeUpload.findUnique>>);
    parseUploadedResumeMock.mockResolvedValue(parsedJson);
    vi.mocked(prisma.resumeUpload.update).mockResolvedValue({
      id: "upload_1",
      parsingStatus: "needs_review",
      parsedJson,
    } as unknown as Awaited<ReturnType<typeof prisma.resumeUpload.update>>);

    const response = await POST(new Request("http://localhost/api/resumes/uploads/upload_1/reparse", { method: "POST" }), {
      params: { id: "upload_1" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(parseUploadedResumeMock).toHaveBeenCalledWith(expect.stringContaining("PROFESSIONAL EXPERIENCE"));
    expect(prisma.resumeUpload.update).toHaveBeenCalledWith({
      where: { id: "upload_1" },
      data: {
        parsedJson,
        parsingStatus: "needs_review",
      },
    });
    expect(body).toMatchObject({
      parsedJson: expect.objectContaining({
        professionalSummary: "Senior software engineer.",
      }),
      upload: expect.objectContaining({
        parsingStatus: "needs_review",
      }),
    });
  });

  it("returns not found for missing uploads", async () => {
    vi.mocked(prisma.resumeUpload.findUnique).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/resumes/uploads/missing/reparse", { method: "POST" }), {
      params: { id: "missing" },
    });

    expect(response.status).toBe(404);
    expect(parseUploadedResumeMock).not.toHaveBeenCalled();
    expect(prisma.resumeUpload.update).not.toHaveBeenCalled();
  });
});

function parsedResume() {
  return {
    contactInfo: {
      fullName: "Carl Welch",
      email: "carl@example.com",
    },
    professionalSummary: "Senior software engineer.",
    skills: {
      coreSkills: ["React"],
      technicalSkills: ["React", "TypeScript"],
      toolsFrameworksLibraries: ["React"],
      programmingLanguages: ["TypeScript"],
    },
    workExperience: [{
      company: "Yubico",
      title: "Senior Software Engineer",
      startDate: "Jul 2022",
      endDate: "Mar 2026",
      isCurrent: false,
      skills: ["React", "TypeScript"],
      achievements: ["Built enterprise admin workflows."],
    }],
    experienceBullets: [{
      company: "Yubico",
      role: "Senior Software Engineer",
      text: "Built enterprise admin workflows.",
      category: "frontend",
      metrics: {},
      keywords: ["React"],
      sourceText: "Built enterprise admin workflows.",
      truthLevel: "verified" as const,
    }],
    projects: [],
    education: [],
    certifications: [],
    inferredTags: ["React"],
    fieldsNeedingReview: [],
    confidence: 0.9,
  };
}
