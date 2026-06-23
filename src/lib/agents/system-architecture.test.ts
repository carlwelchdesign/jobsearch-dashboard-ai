import { describe, expect, it } from "vitest";
import { buildSystemArchitectureReport, collectSystemArchitectureEvidence } from "@/lib/agents/system-architecture";

describe("system architecture agent", () => {
  it("discovers routes, Prisma schema, agent types, skills, and docs from repo evidence", async () => {
    const evidence = await collectSystemArchitectureEvidence(process.cwd());

    expect(evidence.appRoutes).toContain("/architecture");
    expect(evidence.apiRoutes).toContain("/api/architecture");
    expect(evidence.prismaModels).toContain("AgentRun");
    expect(evidence.agentTypes).toContain("SYSTEM_ARCHITECTURE");
    expect(evidence.skillIds).toContain("system_architecture");
    expect(evidence.docs).toEqual(expect.arrayContaining(["README.md", "wiki/Agents-and-Workflows.md"]));
  });

  it("builds a report with connected nodes, risks, workflows, and decisions", async () => {
    const report = await buildSystemArchitectureReport(process.cwd());

    expect(report.metrics.agentTypes).toBeGreaterThan(0);
    expect(report.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "data:prisma", kind: "data" }),
      expect.objectContaining({ id: "skill:registry", kind: "skill" }),
      expect.objectContaining({ id: "agent:SYSTEM_ARCHITECTURE", kind: "agent" }),
    ]));
    expect(report.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "skill:registry", to: "data:prisma" }),
    ]));
    expect(report.workflows.map((workflow) => workflow.name)).toContain("Jolene operating layer");
    expect(report.risks.length).toBeGreaterThan(0);
    expect(report.risks.map((risk) => risk.title)).not.toContain("Agent types without skill policy coverage");
    expect(report.recommendedDecisions.join(" ")).toContain("architecture report");
  });
});
