import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("LinkedInContentClient UI contract", () => {
  const source = readFileSync("src/app/linkedin-content/linkedin-content-client.tsx", "utf8");

  it("exposes edit, approval, publish retry, agent review, and screenshot controls", () => {
    expect(source).toContain("Copy");
    expect(source).toContain("Save edits");
    expect(source).toContain("Approve and publish");
    expect(source).toContain("Retry publish");
    expect(source).toContain("Archive");
    expect(source).toContain("Agent reviews");
    expect(source).toContain("Aggregate analytics used");
    expect(source).toContain("Plan sources");
    expect(source).toContain("Memory sources");
    expect(source).toContain("Real app screenshots");
    expect(source).toContain("Approval publishes to LinkedIn immediately");
  });

  it("uses a prompt-first composer instead of a content focus dropdown", () => {
    expect(source).toContain("What should we post about today?");
    expect(source).toContain("promptChips");
    expect(source).toContain("Visual direction");
    expect(source).not.toContain('label="Content focus"');
    expect(source).not.toContain("MenuItem");
  });
});
