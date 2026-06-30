import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  buildRecommendationBulletDrafts,
  buildRecommendationEvidenceDraft,
  parseLinkedInRecommendations,
} from "@/lib/evidence/linkedin-recommendations";

const pastedRecommendations = readFileSync(
  "/Users/carl.welch/.codex/attachments/367e6292-bb88-4119-ad81-42e745fe2bde/pasted-text.txt",
  "utf8",
);

describe("LinkedIn recommendation parsing", () => {
  it("parses pasted LinkedIn recommendations into stable structured entries", () => {
    const entries = parseLinkedInRecommendations(pastedRecommendations);

    expect(entries).toHaveLength(13);
    expect(entries[0]).toMatchObject({
      recommenderName: "Sree Sankara",
      recommenderHeadline: "Senior Software Engineer | Senior Application Developer | SAFe Scrum Master",
      date: "June 2, 2026",
      relationship: "Sree was senior to Carl but didn’t manage Carl directly",
    });
    expect(entries[0].body).toContain("rare combination of a keen eye for visualization");
    expect(entries[0].body).not.toContain("more");
    expect(entries[0].sourceRef).toMatch(/^linkedin-recommendation:[a-f0-9]{24}$/);
    expect(entries[0].themes).toEqual(expect.arrayContaining([
      "frontend-visualization-performance",
      "design-system-storybook",
      "feature-leadership",
      "mentorship",
    ]));
  });

  it("builds review-gated evidence from a recommendation", () => {
    const [entry] = parseLinkedInRecommendations(pastedRecommendations);
    const draft = buildRecommendationEvidenceDraft("profile_1", entry);

    expect(draft).toMatchObject({
      candidateProfileId: "profile_1",
      sourceType: "LINKEDIN",
      sourceRef: entry.sourceRef,
      confidence: "NEEDS_REVIEW",
      usableInResume: false,
      usableInCoverLetter: false,
      usableInRecruiterMessage: false,
    });
    expect(draft.tags).toContain("linkedin-recommendation");
    expect(JSON.stringify(draft.metadata)).toContain("third-party reputation signal");
  });

  it("creates proposed bullets only when the recommendation can be tied to a role", () => {
    const entries = parseLinkedInRecommendations(pastedRecommendations);
    const sreeBullets = buildRecommendationBulletDrafts(entries[0]);
    const grindrBullets = buildRecommendationBulletDrafts(entries.find((entry) => entry.recommenderName === "Corbett Trubey")!);

    expect(sreeBullets).toHaveLength(0);
    expect(grindrBullets.length).toBeGreaterThan(0);
    expect(grindrBullets[0]).toMatchObject({
      company: "Grindr",
      truthLevel: "needs_review",
    });
    expect(grindrBullets[0].sourceText).toContain("Corbett Trubey");
  });
});
