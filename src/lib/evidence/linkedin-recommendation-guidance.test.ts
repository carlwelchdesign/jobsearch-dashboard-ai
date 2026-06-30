import { describe, expect, it } from "vitest";
import {
  isLinkedInRecommendationEvidence,
  linkedinRecommendationSignalLine,
} from "@/lib/evidence/linkedin-recommendation-guidance";

describe("LinkedIn recommendation guidance", () => {
  it("identifies imported LinkedIn recommendation evidence", () => {
    expect(isLinkedInRecommendationEvidence({
      sourceType: "LINKEDIN",
      sourceRef: "linkedin-recommendation:abc123",
    })).toBe(true);
    expect(isLinkedInRecommendationEvidence({
      sourceType: "LINKEDIN",
      sourceRef: "profile-sync",
    })).toBe(false);
  });

  it("summarizes recommendation evidence as a third-party signal instead of raw testimonial text", () => {
    const line = linkedinRecommendationSignalLine({
      tags: ["linkedin-recommendation", "mentorship"],
      metadata: {
        recommenderName: "Sree Sankara",
        relationship: "Sree was senior to Carl but didn’t manage Carl directly",
        themes: ["design-system-storybook", "mentorship"],
      },
    });

    expect(line).toContain("Third-party recommendation signal from Sree Sankara");
    expect(line).toContain("design system storybook");
    expect(line).not.toContain("rare combination");
  });
});
