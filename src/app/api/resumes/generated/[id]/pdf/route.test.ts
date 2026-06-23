import { beforeEach, describe, expect, it, vi } from "vitest";
import { createModernTwoColumnResumePdf } from "@/lib/pdf/modern-resume-pdf";
import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/pdf/modern-resume-pdf", () => ({
  createModernTwoColumnResumePdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

vi.mock("@/lib/pdf/simple-resume-pdf", () => ({
  createSimpleTextPdf: vi.fn(() => new Uint8Array([4, 5, 6])),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedResume: { findUnique: vi.fn() },
  },
}));

const findUniqueMock = vi.mocked(prisma.generatedResume.findUnique);
const modernPdfMock = vi.mocked(createModernTwoColumnResumePdf);
const simplePdfMock = vi.mocked(createSimpleTextPdf);

describe("GET /api/resumes/generated/[id]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    findUniqueMock.mockResolvedValue(resume({ resumeFormat: "modern_two_column" }) as never);
  });

  it("uses the live modern two-column profile format by default", async () => {
    const response = await GET(new Request("http://localhost/api/resumes/generated/resume_1/pdf"), { params: { id: "resume_1" } });

    expect(response.status).toBe(200);
    expect(modernPdfMock).toHaveBeenCalledWith("Carl Welch\nSummary\nReact", { profileImage: null });
    expect(simplePdfMock).not.toHaveBeenCalled();
  });

  it("passes a fetched LinkedIn profile image to the modern renderer", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    findUniqueMock.mockResolvedValue(resume({ resumeFormat: "modern_two_column", linkedinPictureUrl: "https://media.licdn.com/photo.jpg" }) as never);
    vi.mocked(fetch).mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/jpeg" } }) as never);

    await GET(new Request("http://localhost/api/resumes/generated/resume_1/pdf"), { params: { id: "resume_1" } });

    expect(modernPdfMock).toHaveBeenCalledWith("Carl Welch\nSummary\nReact", {
      profileImage: { bytes, mimeType: "image/jpeg" },
    });
  });

  it("uses legacy presets when selected", async () => {
    findUniqueMock.mockResolvedValue(resume({ resumeFormat: "swiss" }) as never);

    await GET(new Request("http://localhost/api/resumes/generated/resume_1/pdf"), { params: { id: "resume_1" } });

    expect(simplePdfMock).toHaveBeenCalledWith("Carl Welch\nSummary\nReact", "swiss");
    expect(modernPdfMock).not.toHaveBeenCalled();
  });

  it("supports a query format override for export checks", async () => {
    await GET(new Request("http://localhost/api/resumes/generated/resume_1/pdf?format=atelier"), { params: { id: "resume_1" } });

    expect(simplePdfMock).toHaveBeenCalledWith("Carl Welch\nSummary\nReact", "atelier");
  });
});

function resume({ resumeFormat, linkedinPictureUrl = null }: { resumeFormat: string; linkedinPictureUrl?: string | null }) {
  return {
    id: "resume_1",
    plainText: "Carl Welch\nSummary\nReact",
    markdown: "# Carl Welch",
    jobPosting: { company: "Acme", title: "Senior Engineer" },
    user: { name: "Carl Welch", profile: { resumeFormat, linkedinPictureUrl } },
  };
}
