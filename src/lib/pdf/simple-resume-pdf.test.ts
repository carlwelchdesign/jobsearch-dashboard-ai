import { describe, expect, it } from "vitest";
import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";

describe("createSimpleTextPdf", () => {
  it("renders an ATS single-column PDF without decorative rules or URL underlines", () => {
    const pdf = createSimpleTextPdf([
      "Carl Welch",
      "carl@example.com | 1-805-403-4819 | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
      "",
      "Professional Summary",
      "Senior Frontend Engineer focused on React and TypeScript systems.",
      "",
      "Skills",
      "React, TypeScript, Playwright, Jest",
      "",
      "Professional Experience",
      "Yubico - Senior Software Engineer, Frontend | Jul 2022 - Mar 2026",
      "Skills: React, TypeScript, Storybook",
      "- Built secure SaaS admin-console workflows with measurable frontend test coverage gains.",
      "",
      "Projects",
      "- Job Search OS: Built an agent-powered job search operating system with Next.js, OpenAI APIs, Prisma, PostgreSQL, pgvector, Playwright, and Slack integration.",
      "",
      "Education",
      "Bachelor of Fine Arts",
    ].join("\n"), "ats_single_column");

    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("%PDF-");
    expect(raw).toContain("(PROFESSIONAL SUMMARY) Tj");
    expect(raw).toContain("(SKILLS) Tj");
    expect(raw).toContain("(PROFESSIONAL EXPERIENCE) Tj");
    expect(raw).not.toContain(" RG ");
    expect(raw).not.toContain(" l S Q");
  });

  it("keeps a cover-letter company and title line out of the contact header", () => {
    const pdf = createSimpleTextPdf([
      "Carl Welch",
      "carlwelchdesign@gmail.com | 1-805-403-4819 | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
      "Netflix | Senior Client Partner Engineer",
      "",
      "Dear Hiring Team,",
      "",
      "I am interested in this role.",
    ].join("\n"), "ats_single_column");

    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("(Netflix | Senior Client Partner Engineer) Tj");
    expect(raw).not.toContain("(Netflix) Tj");
    expect(raw).not.toContain("(Senior Client Partner Engineer) Tj");
  });

  it("does not treat domain-like company names as contact links", () => {
    const pdf = createSimpleTextPdf([
      "Carl Welch",
      "carlwelchdesign@gmail.com | https://www.linkedin.com/in/carlwelch",
      "X.com | Senior Software Engineer",
      "",
      "Dear Hiring Team,",
    ].join("\n"), "ats_single_column");

    const raw = Buffer.from(pdf).toString("latin1");

    expect(raw).toContain("(X.com | Senior Software Engineer) Tj");
    expect(raw).not.toContain("(X.com) Tj");
    expect(raw).not.toContain("(Senior Software Engineer) Tj");
  });
});
