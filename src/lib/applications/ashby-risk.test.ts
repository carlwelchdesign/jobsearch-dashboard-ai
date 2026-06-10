import { describe, expect, it } from "vitest";
import {
  buildAshbyRiskAssessment,
  classifyAshbyField,
  evaluateAshbyCriteriaVisibility,
  extractAshbyCriteria,
  isAshbyApplication,
} from "@/lib/applications/ashby-risk";

describe("Ashby risk classification", () => {
  it("detects Ashby applications by provider or host", () => {
    expect(isAshbyApplication({ atsProvider: "ashby", applicationUrl: null })).toBe(true);
    expect(isAshbyApplication({ atsProvider: null, applicationUrl: "https://jobs.ashbyhq.com/acme/role/application" })).toBe(true);
    expect(isAshbyApplication({ atsProvider: "greenhouse", applicationUrl: "https://boards.greenhouse.io/acme" })).toBe(false);
  });

  it("classifies common knockout fields with safe suggested answers", () => {
    expect(classifyAshbyField("Are you legally authorized to work in the United States?")).toMatchObject({
      category: "work_authorization",
      riskLevel: "ready",
      suggestedAnswer: "Yes",
      autoFillSafe: true,
    });
    expect(classifyAshbyField("Will you now or in the future require visa sponsorship?")).toMatchObject({
      category: "sponsorship",
      riskLevel: "ready",
      suggestedAnswer: "No",
      autoFillSafe: true,
    });
    expect(classifyAshbyField("What are your salary expectations?")).toMatchObject({
      category: "salary",
      riskLevel: "high_risk",
      autoFillSafe: false,
    });
  });

  it("builds an Ashby checklist with high-risk salary and relocation items", () => {
    const assessment = buildAshbyRiskAssessment({
      atsProvider: "ashby",
      applicationUrl: "https://jobs.ashbyhq.com/acme/123/application",
      job: {
        title: "Senior Frontend Engineer",
        company: "Acme",
        description: "React, TypeScript, GraphQL. 8+ years of experience. Salary expectations and relocation required.",
        location: "Remote US",
        remoteType: "remote",
      },
      candidate: { location: "Los Angeles, CA, United States", yearsExperience: 20 },
      resumeText: "Senior Frontend Engineer with React, TypeScript, GraphQL, SaaS, and dashboard experience.",
    });

    expect(assessment?.enabled).toBe(true);
    expect(assessment?.riskLevel).toBe("high_risk");
    expect(assessment?.checklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "work_authorization", status: "ready" }),
      expect.objectContaining({ category: "sponsorship", status: "ready" }),
      expect.objectContaining({ category: "salary", status: "high_risk" }),
      expect.objectContaining({ category: "relocation", status: "high_risk" }),
      expect.objectContaining({ category: "required_experience", status: "ready", suggestedAnswer: "20" }),
    ]));
  });
});

describe("Ashby criteria visibility", () => {
  it("extracts criteria from the job description", () => {
    expect(extractAshbyCriteria("Build React, TypeScript, GraphQL dashboards with 8+ years experience.")).toEqual([
      "React",
      "TypeScript",
      "GraphQL",
      "dashboards",
      "8+ years",
    ]);
  });

  it("flags criteria missing from the top third of the resume", () => {
    const result = evaluateAshbyCriteriaVisibility({
      jobTitle: "Senior Frontend Engineer",
      jobDescription: "Requires React, TypeScript, GraphQL, design systems, accessibility, and SaaS dashboards.",
      resumeText: [
        "Senior Frontend Engineer with React and TypeScript experience.",
        "Built enterprise interfaces.",
        "Later details mention GraphQL, design systems, accessibility, SaaS, and dashboards.".padStart(2000, "x"),
      ].join("\n"),
    });

    expect(result.status).toBe("high_risk");
    expect(result.presentCriteria).toEqual(expect.arrayContaining(["React", "TypeScript"]));
    expect(result.missingCriteria).toEqual(expect.arrayContaining(["GraphQL", "design systems", "accessibility", "SaaS", "dashboards"]));
    expect(result.suggestedEdits[0]).toContain("summary");
  });
});
