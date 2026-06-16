import { describe, expect, it } from "vitest";
import { runTrustRedTeamFixtures, trustRedTeamFixtures } from "@/lib/observability/red-team-fixtures";

describe("trust red-team fixtures", () => {
  it("detects the major misuse categories", () => {
    const result = runTrustRedTeamFixtures();

    expect(result.passed).toBe(true);
    expect(result.evaluated).toBe(trustRedTeamFixtures.length);
    expect(result.evaluations.map((evaluation) => evaluation.category).sort()).toEqual([
      "linkedin_misuse",
      "private_data_leakage",
      "prompt_injection",
      "unauthorized_external_action",
      "ungrounded_public_content",
      "unsupported_career_claim",
    ].sort());
  });
});
