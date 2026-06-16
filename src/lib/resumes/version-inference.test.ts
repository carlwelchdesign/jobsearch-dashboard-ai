import { describe, expect, it } from "vitest";
import { inferVersionSuggestions } from "@/lib/resumes/version-inference";

describe("inferVersionSuggestions", () => {
  it("suggests React, Node, and TypeScript ranges from role dates when tech is present", () => {
    const suggestions = inferVersionSuggestions({
      technologies: ["React", "TypeScript", "Node.js"],
      startDate: "Mar 2020",
      endDate: "Sep 2022",
      sourceText: "Built React, TypeScript, and Node.js workflows.",
    });

    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "React", suggestedVersion: "16-18", status: "NEEDS_REVIEW" }),
      expect.objectContaining({ name: "TypeScript", suggestedVersion: "3.x-4.x", status: "NEEDS_REVIEW" }),
      expect.objectContaining({ name: "Node.js", suggestedVersion: "12-18", status: "NEEDS_REVIEW" }),
    ]));
  });

  it("does not invent technologies from dates alone", () => {
    const suggestions = inferVersionSuggestions({
      technologies: [],
      startDate: "2020",
      endDate: "2022",
      sourceText: "Built enterprise workflows for sales teams.",
    });

    expect(suggestions).toEqual([]);
  });

  it("prefers explicit source evidence over date windows", () => {
    const suggestions = inferVersionSuggestions({
      technologies: ["React"],
      startDate: "2020",
      endDate: "2022",
      sourceText: "Maintained React 17 dashboards.",
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        name: "React",
        suggestedVersion: "17",
        source: "source_evidence",
        confidence: 0.86,
      }),
    ]);
  });

  it("skips cloud services unless explicit runtime evidence exists", () => {
    const suggestions = inferVersionSuggestions({
      technologies: ["AWS Lambda", "S3", "React"],
      startDate: "2022",
      endDate: "2023",
      sourceText: "Built React workflows deployed with AWS Lambda and S3.",
    });

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(["React"]);
  });
});
