import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("/agents quality gates surface", () => {
  it("keeps the Phase 5 quality gate board wired into the Agent Review Board", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/agents/page.tsx"), "utf8");
    const serviceSource = readFileSync(resolve(process.cwd(), "src/lib/agents/quality-gates.ts"), "utf8");

    expect(pageSource).toContain("AgentQualityGateSection");
    expect(pageSource).toContain("Quality Gates");
    expect(pageSource).toContain("/api/observability/evaluations/run");
    expect(serviceSource).toContain("buildAgentQualityGates");
    expect(serviceSource).toContain("GENERATED_MATERIALS");
    expect(serviceSource).toContain("COMMAND_CENTER");
  });
});
