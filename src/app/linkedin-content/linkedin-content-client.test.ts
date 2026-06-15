import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("LinkedInContentClient UI contract", () => {
  const source = readFileSync("src/app/linkedin-content/linkedin-content-client.tsx", "utf8");

  it("exposes edit, approval, publish retry, agent review, and screenshot controls", () => {
    expect(source).toContain("Copy");
    expect(source).toContain("Save edits");
    expect(source).toContain("Approve and publish");
    expect(source).toContain("Approve anyway and publish");
    expect(source).toContain("I reviewed these warnings and approve publishing anyway");
    expect(source).toContain("overrideReview");
    expect(source).toContain("Retry publish");
    expect(source).toContain("Archive");
    expect(source).toContain("Generation summary");
    expect(source).toContain("Source details");
    expect(source).toContain("Selected evidence");
    expect(source).toContain("Prompt match:");
    expect(source).toContain('label="Visual"');
    expect(source).toContain("Plan sources");
    expect(source).toContain("Visuals");
    expect(source).toContain("Selected publish visual");
    expect(source).toContain("Replace with screenshot");
    expect(source).toContain("Regenerate visuals");
    expect(source).toContain("/visuals/upload");
    expect(source).toContain("/visuals/regenerate");
    expect(source).toContain("Technical diagrams");
    expect(source).toContain("AI polish variants");
    expect(source).toContain("App screenshots");
    expect(source).toContain("qualityReview");
    expect(source).toContain("Renderer:");
    expect(source).toContain("Layout:");
    expect(source).toContain("Topology QA:");
    expect(source).toContain("Legend QA:");
    expect(source).toContain("Provenance:");
    expect(source).toContain("assetType");
    expect(source).toContain("Approval publishes to LinkedIn immediately");
  });

  it("uses a prompt-first composer instead of a content focus dropdown", () => {
    expect(source).toContain("What should we post about today?");
    expect(source).toContain("Visual direction");
    expect(source).toContain('objectFit: "contain"');
    expect(source).not.toContain("promptChips");
    expect(source).not.toContain("formatChips");
    expect(source).not.toContain("Post format");
    expect(source).not.toContain('label="Content focus"');
    expect(source).not.toContain("MenuItem");
  });
});
