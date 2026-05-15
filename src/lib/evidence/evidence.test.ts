import { describe, expect, it } from "vitest";
import { classifyConfidence, classifyEvidenceType } from "@/lib/agents/candidate-intelligence";
import { confidenceMeetsMinimum, truthLevelToEvidenceConfidence } from "@/lib/evidence/confidence";
import { scoreEvidenceText } from "@/lib/evidence/retrieval";
import { inferEvidenceTags } from "@/lib/evidence/tags";

describe("evidence confidence rules", () => {
  it("maps existing truth levels to evidence confidence", () => {
    expect(truthLevelToEvidenceConfidence("verified")).toBe("VERIFIED");
    expect(truthLevelToEvidenceConfidence("inferred")).toBe("INFERRED");
    expect(truthLevelToEvidenceConfidence("estimated")).toBe("INFERRED");
    expect(truthLevelToEvidenceConfidence("needs_review")).toBe("NEEDS_REVIEW");
  });

  it("does not allow needs review evidence when inferred or better is required", () => {
    expect(confidenceMeetsMinimum("VERIFIED", "INFERRED")).toBe(true);
    expect(confidenceMeetsMinimum("INFERRED", "INFERRED")).toBe(true);
    expect(confidenceMeetsMinimum("NEEDS_REVIEW", "INFERRED")).toBe(false);
    expect(confidenceMeetsMinimum("REJECTED", "NEEDS_REVIEW")).toBe(false);
  });
});

describe("candidate intelligence helpers", () => {
  it("does not verify uncertain user input", () => {
    expect(classifyConfidence("USER_INPUT", "I might have led the migration")).toBe("NEEDS_REVIEW");
    expect(classifyConfidence("USER_INPUT", "Built a React dashboard for admin workflows")).toBe("INFERRED");
    expect(classifyConfidence("RESUME_UPLOAD", "Built a React dashboard for admin workflows")).toBe("VERIFIED");
  });

  it("classifies project and skill evidence", () => {
    expect(classifyEvidenceType("Progression Lab AI", "AI-assisted project built with Next.js")).toBe("PROJECT");
    expect(classifyEvidenceType("Core skills", "React TypeScript Storybook Playwright")).toBe("SKILL");
  });
});

describe("evidence retrieval scoring", () => {
  it("requires all requested tags", () => {
    const evidence = {
      title: "WebAuthn Core",
      content: "Reusable authentication package with passkeys",
      tags: ["identity", "webauthn", "security"],
      confidence: "VERIFIED" as const,
    };
    expect(scoreEvidenceText(evidence, "authentication", ["identity"])).toBeGreaterThan(0);
    expect(scoreEvidenceText(evidence, "authentication", ["defense-tech"])).toBe(0);
  });

  it("infers profile-relevant tags", () => {
    expect(inferEvidenceTags("React TypeScript passkeys dashboard")).toEqual(expect.arrayContaining(["react", "typescript", "webauthn", "data-visualization"]));
  });
});
