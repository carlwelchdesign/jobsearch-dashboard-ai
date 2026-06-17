import { describe, expect, it } from "vitest";
import { AtsProvider } from "@prisma/client";
import { reviewApplicationMaterials } from "@/lib/agents/application-qa";

const job = {
  title: "Frontend Engineer",
  company: "Zettabyte",
  description: "Build React and TypeScript product workflows for an Ashby-hosted application.",
  atsProvider: AtsProvider.ashby,
  applicationUrl: "https://jobs.ashbyhq.com/zettabyte/frontend-engineer",
};

describe("reviewApplicationMaterials", () => {
  it("does not let resume-only style checks block cover-letter QA", () => {
    const resumeWithStyleIssues = [
      "Senior frontend engineer — React, TypeScript, product systems.",
      "I am excited to apply this experience across complex interfaces.",
      "Built customer-facing workflows with measurable delivery and careful collaboration.",
    ].join("\n").repeat(12);
    const coverLetter = [
      "Dear Zettabyte hiring team,",
      "",
      "The Frontend Engineer role matches my verified React and TypeScript work on complex product workflows.",
      "I have built customer-facing interfaces with clear component boundaries, pragmatic QA, and close product collaboration.",
      "My recent work has focused on making dense workflows easier to scan, safer to operate, and more reliable for teams that need speed without losing control.",
      "That includes partnering with product and engineering peers, translating ambiguous requirements into shipped UI, and keeping implementation details understandable for future iteration.",
      "",
      "Best,",
      "Carl Welch",
    ].join("\n");

    const qa = reviewApplicationMaterials({
      job,
      resumeMarkdown: resumeWithStyleIssues,
      coverLetterBody: coverLetter,
      evidenceRefs: ["ev_react_product_workflows"],
    });

    expect(qa.status).toBe("PASS");
    expect(qa.styleViolations).toEqual([]);
  });

  it("keeps Ashby top-third visibility checks scoped to resume QA", () => {
    const weakAshbyResume = "React frontend engineer with product workflow experience.".repeat(35);
    const coverLetter = [
      "Dear Zettabyte hiring team,",
      "",
      "The Frontend Engineer role maps to my verified React and TypeScript experience building product workflows.",
      "I can bring practical frontend execution, interface judgment, and maintainable implementation habits to the team.",
      "My strongest fit is turning complex product requirements into clear interface behavior, then working closely with engineers and stakeholders until the workflow is usable in real conditions.",
      "I would focus on polished execution, careful tradeoffs, and enough implementation rigor that the product remains easy to extend after launch.",
      "",
      "Best,",
      "Carl Welch",
    ].join("\n");

    const coverLetterQa = reviewApplicationMaterials({
      job,
      resumeMarkdown: weakAshbyResume,
      coverLetterBody: coverLetter,
      evidenceRefs: ["ev_react_product_workflows"],
    });
    const resumeQa = reviewApplicationMaterials({
      job,
      resumeMarkdown: weakAshbyResume,
      evidenceRefs: ["ev_react_product_workflows"],
    });

    expect(coverLetterQa.ashbyCriteriaVisibility).toBeUndefined();
    expect(coverLetterQa.status).toBe("PASS");
    expect(resumeQa.ashbyCriteriaVisibility?.status).not.toBe("ready");
    expect(resumeQa.status).toBe("NEEDS_REVIEW");
  });
});
