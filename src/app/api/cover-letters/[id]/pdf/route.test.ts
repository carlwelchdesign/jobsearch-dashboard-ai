import { beforeEach, describe, expect, it, vi } from "vitest";
import { createModernCoverLetterPdf } from "@/lib/pdf/modern-resume-pdf";
import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/pdf/modern-resume-pdf", () => ({
  createModernCoverLetterPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

vi.mock("@/lib/pdf/simple-resume-pdf", () => ({
  createSimpleTextPdf: vi.fn(() => new Uint8Array([4, 5, 6])),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedCoverLetter: { findUnique: vi.fn() },
  },
}));

const findUniqueMock = vi.mocked(prisma.generatedCoverLetter.findUnique);
const modernPdfMock = vi.mocked(createModernCoverLetterPdf);
const simplePdfMock = vi.mocked(createSimpleTextPdf);

describe("GET /api/cover-letters/[id]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    findUniqueMock.mockResolvedValue(coverLetter({ resumeFormat: "modern_two_column" }) as never);
  });

  it("uses the modern renderer and includes the same contact header as resume exports", async () => {
    const response = await GET(
      new Request("http://localhost/api/cover-letters/letter_1/pdf"),
      { params: { id: "letter_1" } },
    );

    expect(response.status).toBe(200);
    expect(modernPdfMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "Carl Welch\ncarl@example.com | 1-805-403-4819 | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign",
      ),
      { profileImage: null },
    );
    expect(simplePdfMock).not.toHaveBeenCalled();
  });

  it("uses a matching legacy renderer when the profile selects a legacy resume format", async () => {
    findUniqueMock.mockResolvedValue(coverLetter({ resumeFormat: "swiss" }) as never);

    await GET(new Request("http://localhost/api/cover-letters/letter_1/pdf"), {
      params: { id: "letter_1" },
    });

    expect(simplePdfMock).toHaveBeenCalledWith(expect.stringContaining("Dear Acme team,"), "swiss");
    expect(modernPdfMock).not.toHaveBeenCalled();
  });

  it("supports a query format override", async () => {
    await GET(new Request("http://localhost/api/cover-letters/letter_1/pdf?format=ats_single_column"), {
      params: { id: "letter_1" },
    });

    expect(simplePdfMock).toHaveBeenCalledWith(expect.stringContaining("Dear Acme team,"), "ats_single_column");
  });
});

function coverLetter({ resumeFormat }: { resumeFormat: string }) {
  return {
    id: "letter_1",
    body: "Dear Acme team,\n\nI am interested in this role.\n\nBest,\nCarl",
    jobPosting: { company: "Acme", title: "Senior Frontend Engineer" },
    user: {
      name: "Carl Welch",
      email: "fallback@example.com",
      profile: {
        fullName: "Carl Welch",
        email: "carl@example.com",
        phone: "1-805-403-4819",
        location: "Remote",
        linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/",
        linkedinPictureUrl: null,
        githubUrl: "https://github.com/carlwelchdesign/jobseach-dashboard-ai",
        portfolioUrl: null,
        resumeFormat,
        githubRepositories: [],
      },
    },
  };
}
