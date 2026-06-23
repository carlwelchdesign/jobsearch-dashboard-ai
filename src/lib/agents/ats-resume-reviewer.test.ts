import { describe, expect, it } from "vitest";
import { reviewAtsResume } from "@/lib/agents/ats-resume-reviewer";

const job = {
  title: "Senior Frontend Engineer",
  company: "Close",
  description: "Build React, TypeScript, GraphQL, accessibility, design systems, and SaaS dashboard workflows.",
};

describe("reviewAtsResume", () => {
  it("flags awkward generated summary phrasing and applies a safe rewrite", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "carl@example.com | https://www.linkedin.com/in/ | https://github.com/",
          "",
          "## Summary",
          "Senior Software Engineer. Selected strengths for Senior Frontend Engineer @ Close's Senior Frontend Engineer role include React, TypeScript.",
          "",
          "## Skills",
          "React, TypeScript",
          "",
          "## Professional Experience",
          "- Built frontend workflows.",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
      userProfile: {
        email: "carl@example.com",
        phone: null,
        location: "Remote",
        linkedinUrl: "https://www.linkedin.com/in/carlwelchdesign/",
        githubUrl: "https://github.com/carlwelchdesign",
        portfolioUrl: null,
      },
    });

    expect(review.status).toBe("NEEDS_REVIEW");
    expect(review.recruiterRedFlags).toContain("Summary contains generated scaffold language that can look automated to recruiters.");
    expect(review.formatWarnings).toEqual(expect.arrayContaining(["LinkedIn URL is incomplete.", "GitHub URL is incomplete."]));
    expect(review.rewriteDecision.applied).toBe(true);
    expect(review.rewrittenMarkdown).toContain("https://www.linkedin.com/in/carlwelchdesign");
    expect(review.rewrittenMarkdown).toContain("https://github.com/carlwelchdesign");
    expect(review.rewrittenMarkdown).not.toContain("Selected strengths for");
  });

  it("detects missing important role keywords without rewriting for minor gaps", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "carl@example.com | Remote | https://github.com/carlwelchdesign",
          "",
          "## Summary",
          "Senior frontend engineer building React product workflows.",
          "",
          "## Skills",
          "React",
          "",
          "## Professional Experience",
          "- Built production interfaces.",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
    });

    expect(review.keywordCoverage.missingImportant).toEqual(expect.arrayContaining(["TypeScript", "GraphQL", "accessibility", "design systems", "SaaS", "dashboard"]));
    expect(review.formatWarnings).toContain("LinkedIn profile URL is missing from the resume contact line.");
    expect(review.rewriteDecision.applied).toBe(false);
  });

  it("flags low quantified-achievement density in experience bullets", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "carl@example.com | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign",
          "",
          "## Summary",
          "Senior frontend engineer building React product workflows.",
          "",
          "## Skills",
          "React, TypeScript",
          "",
          "## Professional Experience",
          "- Migrated legacy Backbone screens to React and TypeScript while introducing shared components and modern frontend patterns.",
          "- Led frontend architecture and onsite forward-deployed development for major retail and entertainment brands.",
          "- Created virtual reality software applications providing interactive operator training across lab, station, and classroom presentations.",
          "- Built analytics dashboards and reporting tools for customer segmentation workflows.",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
    });

    expect(review.status).toBe("NEEDS_REVIEW");
    expect(review.recruiterRedFlags).toContain("Experience bullets have low quantified-achievement density.");
    expect(review.recommendedEdits).toContain("Prefer approved bullets with numbers, percentages, dollar amounts, team size, countries, users, or delivery scale.");
  });

  it("flags and rewrites repeated action-verb openers without changing claims", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "carl@example.com | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign",
          "",
          "## Summary",
          "Senior frontend engineer building React product workflows.",
          "",
          "## Skills",
          "React, TypeScript",
          "",
          "## Professional Experience",
          "- Led enterprise admin console delivery for identity teams.",
          "- Led Storybook adoption across frontend teams.",
          "- Led frontend architecture for major retail and entertainment brands.",
          "- Led mobile release planning across three countries.",
          "- Developed Salesforce integration workflows.",
          "- Developed analytics dashboards and reporting tools.",
          "- Developed campaign package automation improving workflow efficiency by 2400%.",
          "- Created workflow tooling for enterprise teams.",
          "- Created reporting interfaces for customer teams.",
          "- Created campaign landing pages.",
          "- Created mobile support tooling.",
          "- Delivered admin console features.",
          "- Delivered dashboard workflows.",
          "- Delivered app store release support.",
          "- Delivered stakeholder demos.",
          "- Implemented API integrations.",
          "- Implemented component library standards.",
          "- Implemented QA automation.",
          "- Implemented analytics workflows.",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
    });

    expect(review.recruiterRedFlags.join(" ")).toContain("led (4)");
    expect(review.recruiterRedFlags.join(" ")).toContain("created (4)");
    expect(review.recruiterRedFlags.join(" ")).toContain("delivered (4)");
    expect(review.recruiterRedFlags.join(" ")).toContain("implemented (4)");
    expect(review.rewriteDecision.applied).toBe(true);
    expect(review.rewrittenMarkdown).toContain("workflow efficiency by 2400%");
    expect(maxRepeatedOpenerCount(review.rewrittenMarkdown ?? "")).toBeLessThanOrEqual(2);
  });

  it("flags ATS-hostile formatting and inferred technology claims", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "| Skill | Evidence |",
          "| --- | --- |",
          "| React | likely React 16-17 |",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
    });

    expect(review.status).toBe("BLOCKED");
    expect(review.formatWarnings).toEqual(expect.arrayContaining(["Markdown table formatting can parse poorly in ATS systems."]));
    expect(review.evidenceRisks).toContain("Resume contains inferred or uncertain technology/version language.");
  });

  it("removes uncertain technology/version language when rewriting", () => {
    const review = reviewAtsResume({
      job,
      resume: {
        markdown: [
          "# Carl Welch",
          "carl@example.com | Remote | https://www.linkedin.com/in/carlwelchdesign | https://github.com/carlwelchdesign",
          "",
          "## Summary",
          "Senior frontend engineer building React product workflows.",
          "",
          "## Skills",
          "React, TypeScript",
          "",
          "## Professional Experience",
          "- Built React workflows with likely React 16-17 based on available evidence.",
          "- Built TypeScript dashboard workflows.",
          "- Built GraphQL API integrations.",
        ].join("\n"),
        plainText: "",
        atsChecks: {},
      },
    });

    expect(review.evidenceRisks).toContain("Resume contains inferred or uncertain technology/version language.");
    expect(review.rewriteDecision.applied).toBe(true);
    expect(review.rewrittenMarkdown).not.toMatch(/\b(likely|React 16-17|available evidence)\b/i);

    const followUp = reviewAtsResume({
      job,
      resume: {
        markdown: review.rewrittenMarkdown ?? "",
        plainText: review.rewrittenPlainText ?? "",
        atsChecks: {},
      },
    });

    expect(followUp.evidenceRisks).toEqual([]);
  });
});

function maxRepeatedOpenerCount(text: string) {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const word = line.trim().replace(/^[-*]\s+/, "").match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
    if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}
