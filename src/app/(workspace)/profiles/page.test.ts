import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Search Profiles recruiting search team", () => {
  it("surfaces the Phase 6 recruiting search optimization panel", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/(workspace)/profiles/page.tsx"), "utf8");
    const panelSource = readFileSync(resolve(process.cwd(), "src/app/(workspace)/profiles/search-optimization-panel.tsx"), "utf8");

    expect(pageSource).toContain("SearchOptimizationPanel");
    expect(pageSource).toContain("searchOptimizationRun.findFirst");
    expect(panelSource).toContain("Recruiting Search Team");
    expect(panelSource).toContain("/api/search-optimization/run");
    expect(panelSource).toContain("/api/search-optimization/changes/");
    expect(panelSource).toContain("Rollback");
  });

  it("surfaces the resume approval handoff state", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/(workspace)/profiles/page.tsx"), "utf8");

    expect(pageSource).toContain("resumeApproved");
    expect(pageSource).toContain("Candidate profile approved.");
    expect(pageSource).toContain("AI opportunity scan");
  });
});
