import { describe, expect, it } from "vitest";
import { buildJobEvidenceGroups } from "./job-evidence";

describe("buildJobEvidenceGroups", () => {
  it("groups duplicate work experiences and attaches linked and matched bullets", () => {
    const result = buildJobEvidenceGroups([
      {
        id: "work_1",
        company: "Revenue.io",
        title: "Senior Software Engineer",
        startDate: "Jan 2021",
        endDate: "Dec 2023",
        isCurrent: false,
        skills: ["React"],
        sourceResumeUploadId: "upload_1",
        resumeContext: {
          applicationSummary: "Built guided selling workflows.",
          confirmedTech: [{ name: "React", version: "17", source: "user_confirmed" }],
          versionSuggestions: [],
        },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "work_2",
        company: "revenue io",
        title: "Senior Software Engineer",
        startDate: "2021",
        endDate: "2023",
        isCurrent: false,
        skills: ["TypeScript"],
        sourceResumeUploadId: "upload_2",
        resumeContext: {
          confirmedTech: [{ name: "TypeScript", source: "user_confirmed" }],
          versionSuggestions: [],
        },
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ], [
      {
        id: "bullet_linked",
        workExperienceId: "work_1",
        company: "Revenue.io",
        role: "Senior Software Engineer",
        category: "frontend",
        text: "Built guided selling workflows in React.",
        keywords: ["React"],
        sourceText: null,
        truthLevel: "verified",
      },
      {
        id: "bullet_matched",
        workExperienceId: null,
        company: "Revenue.io",
        role: "Senior Software Engineer",
        category: "fullstack",
        text: "Improved workflow delivery with TypeScript.",
        keywords: ["TypeScript"],
        sourceText: null,
        truthLevel: "needs_review",
      },
      {
        id: "bullet_unmatched",
        workExperienceId: null,
        company: "Acme",
        role: "Designer",
        category: "design_systems",
        text: "Built a design system.",
        keywords: [],
        sourceText: null,
        truthLevel: "verified",
      },
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].workExperiences).toHaveLength(2);
    expect(result.groups[0].bullets.map((bullet) => bullet.id)).toEqual(["bullet_linked", "bullet_matched"]);
    expect(result.groups[0].autoMatchedBullets.map((bullet) => bullet.id)).toEqual(["bullet_matched"]);
    expect(result.groups[0].readiness.duplicateSources).toBe(1);
    expect(result.groups[0].readiness.pendingBulletReview).toBe(1);
    expect(result.groups[0].confirmedTech.map((tech) => tech.name)).toEqual(["React", "TypeScript"]);
    expect(result.unmatchedBullets.map((bullet) => bullet.id)).toEqual(["bullet_unmatched"]);
    expect(result.bulletMatchReviews).toEqual([{
      bulletId: "bullet_matched",
      suggestedWorkExperienceId: "work_1",
      confidence: "exact_company_role",
    }]);
  });
});
