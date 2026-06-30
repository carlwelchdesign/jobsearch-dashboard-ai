import { describe, expect, it } from "vitest";
import { buildCoverLetterDocumentText } from "@/lib/cover-letters/document";

describe("buildCoverLetterDocumentText", () => {
  it("adds the candidate contact header before the cover letter body", () => {
    const text = buildCoverLetterDocumentText({
      body: "Dear Acme team,\n\nI am interested in the role.\n\nBest,\nCarl",
      jobPosting: { company: "Acme", title: "Senior Frontend Engineer" },
      user: {
        name: "Carl Welch",
        email: "user@example.com",
        profile: {
          fullName: "Carl Welch",
          email: "carl@example.com",
          phone: "1-805-403-4819",
          location: "Remote",
          linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/",
          githubUrl: null,
          portfolioUrl: "https://carl.example.com",
          githubRepositories: [
            {
              htmlUrl: "https://github.com/carlwelchdesign/jobseach-dashboard-ai",
              fullName: "carlwelchdesign/jobseach-dashboard-ai",
            },
          ],
        },
      },
    });

    expect(text).toContain(
      "Carl Welch\ncarl@example.com | 1-805-403-4819 | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign | https://carl.example.com",
    );
    expect(text).toContain("Acme | Senior Frontend Engineer");
    expect(text).toContain("Dear Acme team,");
  });
});
