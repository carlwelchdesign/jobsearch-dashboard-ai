import { describe, expect, it } from "vitest";
import { classifyApplicationPrepReadiness } from "./prep-readiness";

describe("classifyApplicationPrepReadiness", () => {
  it("archives missing or non-direct URLs out of the active prep queue", () => {
    expect(classifyApplicationPrepReadiness(application({ applicationUrl: null })).kind).toBe("no_direct_url");
    expect(classifyApplicationPrepReadiness(application({ applicationUrl: "https://builtin.com/job/frontend-engineer/123" })).kind).toBe("no_direct_url");
  });

  it("classifies direct URL applications without materials as needing materials", () => {
    expect(classifyApplicationPrepReadiness(application({ resumeId: null })).kind).toBe("needs_materials");
    expect(classifyApplicationPrepReadiness(application({ coverLetterId: null })).kind).toBe("needs_materials");
  });

  it("classifies launchable materials as ready to move", () => {
    expect(classifyApplicationPrepReadiness(application({ materialQuality: { launchable: true, status: "PASS" } })).kind).toBe("ready_to_move");
  });

  it("treats material quality findings as advisory when materials and a direct URL exist", () => {
    const readiness = classifyApplicationPrepReadiness(application({
      materialQuality: {
        launchable: false,
        status: "BLOCKED",
        reason: "OpenAI rate limits blocked structured cover-letter generation. Regeneration is required before launch.",
        reasons: ["openai_rate_limited"],
      },
    }));

    expect(readiness.kind).toBe("ready_to_move");
    expect(readiness.reason).toContain("OpenAI rate limits");
  });
});

function application(input: {
  applicationUrl?: string | null;
  resumeId?: string | null;
  coverLetterId?: string | null;
  materialQuality?: Partial<{
    launchable: boolean;
    status: "PASS" | "NEEDS_REVIEW" | "BLOCKED";
    reason: string;
    reasons: string[];
  }>;
} = {}) {
  return {
    resumeId: input.resumeId === undefined ? "resume_1" : input.resumeId,
    coverLetterId: input.coverLetterId === undefined ? "letter_1" : input.coverLetterId,
    jobPosting: {
      applicationUrl: input.applicationUrl === undefined ? "https://jobs.ashbyhq.com/acme/frontend/application" : input.applicationUrl,
    },
    coverLetter: {
      generationNotes: {
        materialQuality: {
          launchable: input.materialQuality?.launchable ?? true,
          status: input.materialQuality?.status ?? "PASS",
          reason: input.materialQuality?.reason ?? "Cover letter passed material quality review.",
          reasons: input.materialQuality?.reasons ?? [],
          score: input.materialQuality?.status === "BLOCKED" ? 42 : 92,
          generatedBy: "openai_structured_outputs",
          evidenceRefs: [],
        },
      },
    },
  };
}
