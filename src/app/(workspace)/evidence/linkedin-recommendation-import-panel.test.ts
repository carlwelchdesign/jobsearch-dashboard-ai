import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("LinkedInRecommendationImportPanel UI contract", () => {
  const source = readFileSync("src/app/(workspace)/evidence/linkedin-recommendation-import-panel.tsx", "utf8");

  it("exposes paste, preview, import, duplicate review, and proposed bullet controls", () => {
    expect(source).toContain("Import LinkedIn recommendations");
    expect(source).toContain("Pasted recommendations");
    expect(source).toContain("Preview");
    expect(source).toContain("Import");
    expect(source).toContain("Review LinkedIn evidence");
    expect(source).toContain("duplicate");
    expect(source).toContain("Also create proposed profile bullets");
    expect(source).toContain("/api/evidence/linkedin-recommendations");
  });
});
