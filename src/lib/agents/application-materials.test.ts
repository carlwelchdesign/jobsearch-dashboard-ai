import type { CandidateEvidence, JobPosting, JobSearchProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { reviewApplicationMaterials } from "@/lib/agents/application-qa";
import { buildResumeStrategy, chooseControlledResumeProfile } from "@/lib/agents/resume-strategy";

describe("buildResumeStrategy", () => {
  it("chooses security positioning from role and evidence", () => {
    const strategy = buildResumeStrategy({
      job: {
        title: "Senior Frontend Engineer, Identity",
        company: "Example Security",
        description: "Build React admin consoles for passkeys, authentication, WebAuthn, and enterprise security workflows.",
      } as JobPosting,
      profile: {
        name: "Security SaaS",
        titles: ["Senior Frontend Engineer"],
        keywordsRequired: ["React", "TypeScript"],
        keywordsPreferred: ["WebAuthn", "passkeys"],
        industries: ["security", "identity"],
      } as unknown as JobSearchProfile,
      evidence: [
        {
          id: "ev1",
          title: "WebAuthn Core",
          content: "Reusable passkey orchestration package.",
          type: "PROJECT",
          tags: ["webauthn", "passkeys", "security", "typescript"],
        },
      ] as CandidateEvidence[],
    });

    expect(strategy.recommendedResumeProfile).toContain("Security");
    expect(strategy.evidenceRefs).toEqual(["ev1"]);
    expect(strategy.priorityProjects).toContain("WebAuthn Core");
  });

  it("selects an active controlled resume profile by evidence tags", () => {
    const profile = chooseControlledResumeProfile(
      "Build authentication admin workflows with React and TypeScript",
      ["identity", "webauthn", "react"],
      null,
      [
        { name: "AI Product Engineer", evidenceTags: ["ai-product", "openai"] },
        { name: "Security SaaS / Identity", evidenceTags: ["identity", "webauthn", "security"] },
      ],
    );

    expect(profile).toBe("Security SaaS / Identity");
  });
});

describe("reviewApplicationMaterials", () => {
  it("flags style violations and risky unsupported claims", () => {
    const qa = reviewApplicationMaterials({
      job: {
        title: "Frontend Engineer",
        company: "Example Co",
        description: "React and TypeScript role.",
      } as JobPosting,
      resumeMarkdown: "# Candidate\nManaged a team of engineers — built React systems.",
      coverLetterBody: "I am excited to apply. It is not just frontend, it is impact.",
      evidenceRefs: [],
    });

    expect(qa.status).toBe("NEEDS_REVIEW");
    expect(qa.styleViolations.length).toBeGreaterThan(0);
    expect(qa.unsupportedClaims.some((claim) => claim.includes("people-management"))).toBe(true);
    expect(qa.warnings).toContain("No evidence references are attached to these materials.");
  });

  it("applies assistant QA learning for cover letter and field classification issues", () => {
    const qa = reviewApplicationMaterials({
      job: {
        title: "Frontend Engineer",
        company: "Example Co",
        description: "React and TypeScript role.",
      } as JobPosting,
      resumeMarkdown: "# Candidate\nBuilt React systems.",
      coverLetterBody: null,
      evidenceRefs: ["ev1"],
      learningRules: {
        coverLetterFieldQa: true,
        fieldClassificationQa: true,
        appliedCategories: ["cover_letter_field", "field_classification"],
        appliedAdjustmentIds: ["adjustment_1", "adjustment_2"],
      },
    });

    expect(qa.status).toBe("NEEDS_REVIEW");
    expect(qa.warnings).toEqual(expect.arrayContaining([
      "Active learning: cover-letter fields have been missed before, so confirm whether this application needs a cover letter.",
      "Active learning: field-classification mistakes have been reported, so manually review unknown required fields before submit.",
    ]));
    expect(qa.suggestedEdits).toContain("If the application asks why you want to join, paste or adapt the generated cover letter before submit.");
    expect(qa.appliedLearning).toEqual(["cover_letter_field", "field_classification"]);
  });

  it("flags Ashby resume criteria that are not visible near the top", () => {
    const qa = reviewApplicationMaterials({
      job: {
        title: "Senior Frontend Engineer",
        company: "Ashby Co",
        description: "Requires React, TypeScript, GraphQL, design systems, accessibility, and SaaS dashboards.",
        atsProvider: "ashby",
        applicationUrl: "https://jobs.ashbyhq.com/acme/123/application",
      } as JobPosting,
      resumeMarkdown: [
        "# Candidate\nSenior Frontend Engineer with React and TypeScript experience.",
        "Built enterprise interfaces.",
        "Later section: GraphQL, design systems, accessibility, SaaS, dashboards.".padStart(2000, "x"),
      ].join("\n"),
      coverLetterBody: null,
      evidenceRefs: ["ev1"],
    });

    expect(qa.status).toBe("NEEDS_REVIEW");
    expect(qa.ashbyCriteriaVisibility?.missingCriteria).toEqual(expect.arrayContaining(["GraphQL", "design systems", "accessibility"]));
    expect(qa.warnings.some((warning) => warning.includes("Top-third resume visibility"))).toBe(true);
    expect(qa.suggestedEdits.some((edit) => edit.includes("summary"))).toBe(true);
  });

  it("flags unapproved inferred technology version language", () => {
    const qa = reviewApplicationMaterials({
      job: {
        title: "Frontend Engineer",
        company: "Example Co",
        description: "React and TypeScript role.",
      } as JobPosting,
      resumeMarkdown: "# Candidate\nTech Used: likely React 16-17, TypeScript 3.x-4.x",
      coverLetterBody: null,
      evidenceRefs: ["ev1"],
    });

    expect(qa.status).toBe("NEEDS_REVIEW");
    expect(qa.unsupportedClaims.some((claim) => claim.includes("unapproved inferred technology/version"))).toBe(true);
    expect(qa.suggestedEdits).toContain("Remove inferred version language from the resume, or approve the exact version in the resume profile first.");
  });
});
