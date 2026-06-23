import { describe, expect, it } from "vitest";
import { createModernTwoColumnResumePdf } from "@/lib/pdf/modern-resume-pdf";

describe("createModernTwoColumnResumePdf", () => {
  it("renders resume sections as PDF text without overlay branding", () => {
    const pdf = createModernTwoColumnResumePdf([
      "Carl Welch",
      "carl@example.com | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
      "",
      "Summary",
      "Senior Software Engineer building React systems.",
      "",
      "Skills",
      "React, TypeScript, Playwright",
      "",
      "Professional Experience",
      "Yubico - Senior Software Engineer | 2022 - 2026",
      "Skills: React, TypeScript",
      "- Increased test automation by 50%.",
      "",
      "Projects",
      "- Job Search OS: Local-first AI job search operating system.",
      "",
      "Education",
      "Bachelor of Fine Arts",
    ].join("\n"));
    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("CARL WELCH");
    expect(raw).toContain("EXPERIENCE");
    expect(raw).toContain("SUMMARY");
    expect(raw).toContain("React");
    expect(raw).toContain("Job Search OS");
    expect(raw).not.toContain("Build an ATS-friendly Resume");
    expect(raw).not.toContain("Enhancv");
  });
});
