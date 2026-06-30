import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedCoverLetter: { findUnique: vi.fn() },
  },
}));

const findUniqueMock = vi.mocked(prisma.generatedCoverLetter.findUnique);

describe("GET /api/cover-letters/[id]/plain-text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(coverLetter() as never);
  });

  it("exports a full cover letter document with candidate contact information", async () => {
    const response = await GET(
      new Request("http://localhost/api/cover-letters/letter_1/plain-text"),
      { params: { id: "letter_1" } },
    );

    const text = await response.text();
    expect(text).toContain(
      "Carl Welch\ncarl@example.com | 1-805-403-4819 | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign",
    );
    expect(text).toContain("Acme | Senior Frontend Engineer");
    expect(text).toContain("Dear Acme team,");
  });

  it("returns 404 for a missing cover letter", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/cover-letters/missing/plain-text"),
      { params: { id: "missing" } },
    );

    expect(response.status).toBe(404);
  });
});

function coverLetter() {
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
        githubUrl: "https://github.com/carlwelchdesign/jobseach-dashboard-ai",
        portfolioUrl: null,
        resumeFormat: "modern_two_column",
        githubRepositories: [],
      },
    },
  };
}
