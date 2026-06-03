import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { buildDeterministicDigest, digestRoleDescriptionToBullets, inferRoleDescriptionMetadata } from "@/lib/resumes/bullet-digest";

vi.mock("@/lib/ai/openai", () => ({
  parseStructuredOutput: vi.fn(),
}));

const parseStructuredOutputMock = vi.mocked(parseStructuredOutput);

describe("role description bullet digest", () => {
  beforeEach(() => {
    parseStructuredOutputMock.mockReset();
  });

  it("uses supported structured bullets when source excerpts are present", async () => {
    parseStructuredOutputMock.mockResolvedValue({
      bullets: [{
        text: "Built React and TypeScript dashboards for internal workflow automation",
        keywords: ["React", "TypeScript"],
        sourceExcerpt: "Built React and TypeScript dashboards for internal workflow automation.",
        confidenceNotes: "Directly supported by source text.",
      }],
      warnings: [],
    });

    const digest = await digestRoleDescriptionToBullets({
      company: "Acme",
      role: "Senior Frontend Engineer",
      category: "frontend",
      description: "Built React and TypeScript dashboards for internal workflow automation. Partnered with product and design on UX improvements.",
    });

    expect(digest.bullets).toHaveLength(1);
    expect(digest.bullets[0]).toMatchObject({
      text: "Built React and TypeScript dashboards for internal workflow automation",
      keywords: ["React", "TypeScript"],
    });
  });

  it("drops unsupported generated bullets instead of accepting fabricated claims", async () => {
    parseStructuredOutputMock.mockResolvedValue({
      bullets: [{
        text: "Improved conversion by 42% across 5 million users",
        keywords: ["conversion"],
        sourceExcerpt: "Improved conversion by 42% across 5 million users.",
        confidenceNotes: "Not actually supported.",
      }],
      warnings: [],
    });

    const digest = await digestRoleDescriptionToBullets({
      company: "Acme",
      role: "Frontend Engineer",
      category: "frontend",
      description: "Built reusable React components and collaborated with designers on accessible user interfaces.",
    });

    expect(digest.bullets[0].text).not.toContain("42%");
    expect(digest.warnings.join(" ")).toMatch(/dropped|No explicit metrics/);
  });

  it("falls back deterministically when structured output is unavailable", async () => {
    parseStructuredOutputMock.mockResolvedValue(null);

    const digest = await digestRoleDescriptionToBullets({
      company: "Acme",
      role: "Frontend Engineer",
      category: "frontend",
      focusAreas: "React, design systems",
      description: [
        "Built React components for a shared design system used across product teams.",
        "Implemented TypeScript API integrations for dashboard workflows.",
        "Partnered with designers and backend engineers to improve accessibility and reliability.",
      ].join(" "),
    });

    expect(digest.bullets.length).toBeGreaterThanOrEqual(3);
    expect(digest.bullets[0]).toMatchObject({
      sourceExcerpt: expect.stringContaining("React"),
    });
  });

  it("does not invent metrics in deterministic fallback", () => {
    const digest = buildDeterministicDigest({
      company: "Acme",
      role: "Frontend Engineer",
      category: "frontend",
      description: "Built frontend features for internal dashboards. Supported testing and design-system work for product teams.",
    });

    expect(digest.bullets.map((bullet) => bullet.text).join(" ")).not.toMatch(/\b\d+%|\b\d+x/);
    expect(digest.warnings).toContain("No explicit metrics were found; proposed bullets avoid invented numbers.");
  });

  it("infers title, company, and category from a LinkedIn-style role block", () => {
    const description = [
      "Senior Software Engineer",
      "Revenue.io · Full-time",
      "Mar 2020 - Sep 2022 · 2 yrs 7 mos",
      "Los Angeles Metropolitan Area",
      "Built frontend features for Revenue.io's AI-driven sales engagement and guided selling platform, supporting sales teams with responsive workflows, analytics, and productivity tools connected to enterprise sales operations.",
      "Worked across React, TypeScript, Backbone.js, Node.js, Hapi, AWS Lambda, and MySQL, contributing to both modern frontend development and legacy application support.",
      "• Developed React/TypeScript interfaces for sales engagement and analytics workflows.",
      "• Maintained and modernized legacy Backbone.js application areas.",
    ].join("\n");

    expect(inferRoleDescriptionMetadata({ description })).toEqual({
      role: "Senior Software Engineer",
      company: "Revenue.io",
      category: "ai",
    });

    const digest = buildDeterministicDigest({ description, focusAreas: "React, TypeScript, sales engagement" });
    expect(digest.bullets.map((bullet) => bullet.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("React/TypeScript interfaces"),
      expect.stringContaining("AI-driven sales engagement"),
    ]));
  });
});
