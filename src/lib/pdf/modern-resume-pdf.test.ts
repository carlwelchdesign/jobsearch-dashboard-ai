import { describe, expect, it } from "vitest";
import { createModernCoverLetterPdf, createModernTwoColumnResumePdf, wrapPdfTextByWidth } from "@/lib/pdf/modern-resume-pdf";

describe("createModernTwoColumnResumePdf", () => {
  it("renders the modern resume with embedded Roboto fonts and without overlay branding", async () => {
    const pdf = await createModernTwoColumnResumePdf([
      "Carl Welch",
      "carl@example.com | 1-805-403-4819 | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
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

    expect(raw).toContain("%PDF-");
    expect(raw).toContain("Roboto-Regular");
    expect(raw).toContain("Roboto-Bold");
    expect(raw).not.toContain("Build an ATS-friendly Resume");
    expect(raw).not.toContain("Enhancv");
  });

  it("wraps long role skills so they cannot bleed into the right column", async () => {
    const longSkills = "Skills: React, TypeScript, Node.js, AWS, Material UI, Storybook, Jest, Playwright, API Integrations, frontend architecture, component library, Test Automation";
    const pdf = await createModernTwoColumnResumePdf([
      "Carl Welch",
      "carl@example.com | https://www.linkedin.com/in/carlwelch",
      "",
      "Professional Experience",
      "Yubico - Senior Software Engineer | 2022 - 2026",
      longSkills,
      "- Increased test automation by 50%.",
    ].join("\n"));
    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("%PDF-");
    expect(raw).toContain("Roboto-Regular");
    expect(raw).not.toContain(longSkills);
  });

  it("wraps text using available PDF width instead of fixed character counts", () => {
    const sentence = "Built analytics dashboards and communication workflows for customer-facing SaaS interfaces with reporting views.";

    const narrow = wrapPdfTextByWidth(sentence, 120, 9.2);
    const wide = wrapPdfTextByWidth(sentence, 330, 9.2);

    expect(narrow.length).toBeGreaterThan(wide.length);
    expect(wide.join(" ")).toBe(sentence);
  });

  it("renders cover letters with the same modern header system", async () => {
    const pdf = await createModernCoverLetterPdf([
      "Carl Welch",
      "carl@example.com | 1-805-403-4819 | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
      "Acme | Senior Frontend Engineer",
      "",
      "Dear Acme team,",
      "",
      "I am interested in the role because it maps to my React, TypeScript, and product engineering background.",
      "",
      "Best,",
      "Carl",
    ].join("\n"));
    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("%PDF-");
    expect(raw).toContain("Roboto-Regular");
    expect(raw).toContain("Roboto-Bold");
    expect(raw).not.toContain("Enhancv");
  });
});
