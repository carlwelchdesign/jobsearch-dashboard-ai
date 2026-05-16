import { describe, expect, it } from "vitest";
import { applyNumericThresholdAdjustments } from "@/lib/skills/adjustments";
import { isSkillFeedbackIntent } from "@/lib/skills/learning";

describe("skill learning", () => {
  it("detects explicit mistake reports for Jolene", () => {
    expect(isSkillFeedbackIntent("That was wrong, do not approve jobs like that again")).toBe(true);
    expect(isSkillFeedbackIntent("Please open the applications page")).toBe(false);
  });

  it("bounds low-risk threshold adjustments", () => {
    const adjusted = applyNumericThresholdAdjustments(
      { minimumScore: 90 },
      [
        {
          id: "adjustment_1",
          kind: "THRESHOLD",
          patchJson: { field: "minimumScore", value: 95 },
          rationale: "Raise threshold",
        } as never,
      ],
      "minimumScore",
      { min: 85, max: 98, maxDelta: 5 },
    );

    expect(adjusted.minimumScore).toBe(95);
  });

  it("ignores threshold jumps outside the low-risk bound", () => {
    const adjusted = applyNumericThresholdAdjustments(
      { minimumScore: 90 },
      [
        {
          id: "adjustment_1",
          kind: "THRESHOLD",
          patchJson: { field: "minimumScore", value: 60 },
          rationale: "Unsafe lower threshold",
        } as never,
      ],
      "minimumScore",
      { min: 85, max: 98, maxDelta: 5 },
    );

    expect(adjusted.minimumScore).toBe(90);
  });
});
