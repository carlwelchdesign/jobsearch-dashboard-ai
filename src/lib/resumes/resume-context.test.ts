import { describe, expect, it } from "vitest";
import { dedupeTechItems, roleSkillsLine, uniqueSkillLabels } from "@/lib/resumes/resume-context";

describe("resume-context skill formatting", () => {
  it("deduplicates role skills case-insensitively while preserving first label casing", () => {
    expect(uniqueSkillLabels([
      "React Native",
      "TypeScript",
      "frontend architecture",
      "Frontend Architecture",
      " API integrations ",
      "API Integrations",
    ])).toEqual(["React Native", "TypeScript", "frontend architecture", "API integrations"]);
  });

  it("deduplicates fallback role Skills lines before rendering resumes", () => {
    expect(roleSkillsLine(null, [
      "React Native",
      "TypeScript",
      "Java",
      "Xcode",
      "frontend architecture",
      "Frontend Architecture",
    ])).toBe("Skills: React Native, TypeScript, Java, Xcode, frontend architecture");
  });

  it("deduplicates approved tech with casing differences", () => {
    expect(dedupeTechItems([
      { name: "frontend architecture", source: "user_confirmed" },
      { name: "Frontend Architecture", source: "source_evidence" },
    ])).toEqual([{ name: "frontend architecture", source: "user_confirmed" }]);
  });
});
