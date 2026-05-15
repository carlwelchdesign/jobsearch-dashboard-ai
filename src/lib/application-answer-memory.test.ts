import { describe, expect, it } from "vitest";
import { buildAnswerMemoryMatch, canonicalizeApplicationQuestion, scoreQuestionSimilarity } from "@/lib/application-answer-memory";

describe("application answer memory", () => {
  it("canonicalizes repeated application questions", () => {
    expect(canonicalizeApplicationQuestion("If you responded other, let us know how you found this job posting.")).toBe("if you responded other how you find job");
  });

  it("scores similar questions higher than unrelated questions", () => {
    const saved = "How did you find this job posting?";
    expect(scoreQuestionSimilarity(saved, "Let us know how you found this role")).toBeGreaterThan(45);
    expect(scoreQuestionSimilarity(saved, "What is your salary expectation?")).toBeLessThan(30);
  });

  it("only auto-uses low-sensitivity exact or near-exact answers", () => {
    const match = buildAnswerMemoryMatch({
      id: "memory_1",
      questionText: "How did you find this job posting?",
      questionCanonical: canonicalizeApplicationQuestion("How did you find this job posting?"),
      answer: "I found it through a personal job search tool that monitors curated company career pages.",
      sensitivity: "LOW",
      reusePolicy: "AUTO_USE",
      useCount: 2,
      lastUsedAt: null,
    }, "How did you find this job posting?");

    expect(match.matchScore).toBe(100);
    expect(match.autoUsable).toBe(true);

    expect(buildAnswerMemoryMatch({ ...match, questionCanonical: canonicalizeApplicationQuestion("What is your salary expectation?"), sensitivity: "HIGH" }, "How did you find this job posting?").autoUsable).toBe(false);
  });
});
