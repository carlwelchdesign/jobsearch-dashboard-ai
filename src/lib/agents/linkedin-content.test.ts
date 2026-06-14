import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildArchitectureDiagramSpecs, buildArchitectureTopologySpec, buildLinkedInContentFallback, planLinkedInPromptIntent, reviewDiagramSpecQuality, reviewLinkedInPostPrivacy, reviewPromptSatisfaction, reviewTopologySpecQuality, type ArchitectureTopologySpec, type LinkedInContentDirection } from "@/lib/agents/linkedin-content";
import { describe, expect, it } from "vitest";

describe("LinkedIn content agent helpers", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/agents/linkedin-content.ts"), "utf8");

  it("uses the dedicated LinkedIn content model for structured generation", () => {
    expect(source).toContain("getLinkedInContentModel");
    expect(source).toContain("generationModel");
    expect(source).toContain("model: input.model");
    expect(source).toContain("input: { ...input, contentPillar: pillar");
  });

  it("generates a grounded deterministic fallback without posting claims", () => {
    const output = buildLinkedInContentFallback({
      pillar: "app_progress",
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 1000, New matches 25."],
        storyAngles: ["Workflow memory should feed content."],
        planSources: [{ filename: "PLAN.md", title: "Jolene Email Operations", summary: "Agents scan mail, draft calendar actions, and report to Jolene.", themes: ["Jolene", "Email Ops"] }],
        noveltySignals: { recentHooks: ["The next content system should remember the work before it writes."], recentTitles: ["Turning app memory into public product notes"], recentPillars: ["app_progress"], recentScreenshotRoutes: ["/dashboard"], avoidPhrases: ["future CMS", "operating system"] },
        analytics: {
          latestSearchRun: {
            funnel: [{ label: "Fetched", value: 1000, helper: "Raw source results" }, { label: "New matches", value: 25, helper: "New profile matches created" }],
            drops: [{ label: "Below threshold", value: 800 }],
            stats: { jobsFetched: 1000, jobsAfterDedupe: 500, jobsAfterFilters: 50, jobsSaved: 25 },
            scoreDistribution: [],
            byProfile: [],
            bySource: [],
            explanations: [],
          },
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 42, querySources: 24, manualSources: 6, priorityOneSources: 8 },
        },
      },
    });

    expect(output.mode).toBe("deterministic");
    expect(output.generationModel).toBe("");
    expect(output.body).toContain("Jolene Email Operations");
    expect(output.body).not.toContain("fetched 1000");
    expect(output.body).not.toContain("below threshold 800");
    expect(output.body).not.toMatch(/\bposted\b/i);
    expect(output.body).not.toMatch(/—/);
  });

  it("uses prompt direction to vary deterministic fallback posts", () => {
    const output = buildLinkedInContentFallback({
      pillar: "workflow_design",
      direction: {
        prompt: "Write a decision diary about agents acting as documentarians.",
        tone: "bold_grounded",
        format: "decision_diary",
        legacyPillar: "workflow_design",
        visualDirection: "show agent run evidence",
        selectedAngle: "Decision diary: documentarians before automation",
        rejectedAngles: ["Generic app progress update"],
        intent: "workflow_story",
        obligations: {
          topic: "agents acting as documentarians",
          requiredConcepts: ["workflow story", "agents", "evidence"],
          requiredVisuals: ["app_screenshot"],
          forbiddenPhrases: ["future CMS"],
          allowSearchFunnelAnalytics: false,
        },
      },
      memoryPack: {
        aggregateFacts: [],
        storyAngles: [],
        planSources: [],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["future CMS"] },
        analytics: {
          latestSearchRun: null,
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    });

    expect(output.hook).toContain("product decision");
    expect(output.body).not.toContain("Write a decision diary");
    expect(output.body).toContain("documentarians before automation");
  });

  it("passes safe aggregate content and rejects private data", () => {
    expect(reviewLinkedInPostPrivacy({
      hook: "A safer workflow starts with clear boundaries.",
      body: "The app tracks aggregate source coverage and review gates without exposing personal application data.",
      disclosureText: "Prepared by my agent content team from the Job Search OS build log.",
      sourceFacts: ["Direct ATS adapters and open-web query coverage are separated."],
      screenshotAssets: [{ label: "App screenshot", route: "/dashboard", privacyStatus: "PASS", warnings: [], description: "Aggregate metrics only." }],
      claims: [{ text: "Direct ATS adapters and open-web query coverage are separated.", provenance: "memory_pack.aggregateFacts", status: "grounded" }],
    })).toMatchObject({ status: "PASS", warnings: [] });

    expect(reviewLinkedInPostPrivacy({
      hook: "Update",
      body: "I applied at Acme for $180k. Email me at person@example.com.",
      disclosureText: "Prepared by agents.",
      sourceFacts: ["https://linkedin.com/jobs/view/123"],
      screenshotAssets: [],
    })).toMatchObject({
      status: "NEEDS_REVIEW",
      blockedTerms: expect.arrayContaining(["email address", "salary or compensation"]),
    });
  });

  it("detects architecture diagram prompts as architecture_diagram intent", () => {
    expect(planLinkedInPromptIntent("I would like a post documenting our system architecture with architectural diagrams")).toBe("architecture_diagram");
    expect(planLinkedInPromptIntent("Write about Jolene scanning my email")).toBe("email_ops");
  });

  it("builds architecture-specific fallback copy without the old generic template", () => {
    const direction = architectureDirection();
    const output = buildLinkedInContentFallback({
      pillar: "architecture",
      direction,
      memoryPack: {
        aggregateFacts: ["Latest search funnel: Fetched 1000, New matches 25."],
        storyAngles: [],
        planSources: [{ filename: "ARCH.md", title: "Architecture Plan", summary: "Document system layers and agent handoffs.", themes: ["Architecture"] }],
        noveltySignals: { recentHooks: [], recentTitles: [], recentPillars: [], recentScreenshotRoutes: [], avoidPhrases: ["future CMS"] },
        analytics: {
          latestSearchRun: null,
          applicationStatusCounts: {},
          outcomeCounts: {},
          agentRunCounts: {},
          sourceCoverage: { activeSources: 0, querySources: 0, manualSources: 0, priorityOneSources: 0 },
        },
      },
    });

    expect(output.body).toContain("Next.js App Router");
    expect(output.body).toContain("Prisma/Postgres");
    expect(output.body).toContain("AgentRun");
    expect(output.body).toContain("diagrams");
    expect(output.body).not.toContain("Today's content brief");
    expect(output.body).not.toContain("I would document");
    expect(output.body).not.toContain("The clearest source is");
    expect(output.body).not.toContain("Latest search funnel");
    expect(output.body).not.toContain("practical testbed");
    expect(output.body).not.toContain("latest run moved through");
    expect(output.body).not.toContain("blank page");
  });

  it("reviews architecture prompt satisfaction and requires diagram assets", () => {
    const direction = architectureDirection();
    const bad = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "Search funnel notes",
        hook: "The latest run moved through a lot of jobs.",
        body: "The latest run moved through fetched 1000 and the boundary matters.",
      },
      visualAssets: [],
    });
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("Architecture prompt requires");

    const good = reviewPromptSatisfaction({
      direction,
      generated: {
        title: "System architecture with diagrams",
        hook: "The architecture diagrams show the agent services and approval gates.",
        body: "The Next.js API routes coordinate agent services. Prisma/Postgres stores AgentRun memory, and LinkedIn publish approval gates keep external actions reviewed. The diagram shows this architecture.",
      },
      visualAssets: [{ label: "Architecture diagram", path: "/generated/test.png", mimeType: "image/png", description: "System Architecture", route: "diagram:system-architecture", assetType: "diagram", privacyStatus: "PASS", warnings: [] }],
    });
    expect(good.status).toBe("PASS");
  });

  it("creates architecture diagram specs for system architecture and content flow", () => {
    const specs = buildArchitectureDiagramSpecs(architectureDirection());
    expect(specs.map((spec) => spec.id)).toEqual(["system-architecture", "agent-content-flow"]);
    expect(specs[0].columns.flatMap((column) => column.items).join(" ")).toContain("Prisma/Postgres");
    expect(specs[0].diagramKind).toBe("system_architecture");
    expect(specs[0].relationships.length).toBeGreaterThan(0);
    expect(specs[0].callouts.join(" ")).toContain("provenance");
    expect(specs[0].provenance.length).toBeGreaterThan(0);
  });

  it("creates topology specs for system architecture prompts", () => {
    const spec = buildArchitectureTopologySpec(architectureDirection());
    expect(spec.id).toBe("job-search-os-topology");
    expect(spec.diagramKind).toBe("system_architecture");
    expect(spec.groups.map((group) => group.id)).toEqual(expect.arrayContaining(["experience", "control", "agents", "memory", "external"]));
    expect(spec.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["dashboard", "api-routes", "jolene-loop", "content-team", "postgres", "linkedin-publish"]));
    expect(spec.edges.length).toBeGreaterThan(6);
    expect(spec.legend.length).toBeGreaterThan(4);
    expect(spec.provenance.length).toBeGreaterThan(0);
  });

  it("reviews topology node, legend, density, overflow, and provenance quality", () => {
    const good = reviewTopologySpecQuality(buildArchitectureTopologySpec(architectureDirection()));
    expect(good.status).toBe("PASS");
    expect(good.checks.topology).toBe("PASS");
    expect(good.checks.legend).toBe("PASS");
    expect(good.checks.provenance).toBe("PASS");

    const bad = reviewTopologySpecQuality(badTopologySpec(), ["Legend card overflow: Too much."]);
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.checks.topology).toBe("NEEDS_REVIEW");
    expect(bad.checks.legend).toBe("NEEDS_REVIEW");
    expect(bad.checks.provenance).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("overflow");
  });

  it("reviews staff-engineer diagram typography, spacing, overflow, and provenance", () => {
    const good = reviewDiagramSpecQuality(buildArchitectureDiagramSpecs(architectureDirection())[0]);
    expect(good.status).toBe("PASS");
    expect(good.checks.typography).toBe("PASS");
    expect(good.checks.provenance).toBe("PASS");

    const bad = reviewDiagramSpecQuality({
      id: "bad",
      title: "Bad",
      subtitle: "Bad",
      diagramKind: "system_architecture",
      rationale: "Bad",
      designIntent: "Bad",
      columns: [
        { title: "Too much", items: ["This label is intentionally far too long for a polished technical diagram and should trigger typography review because it will not scan well on LinkedIn", "Two", "Three", "Four", "Five"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
        { title: "Another", items: ["Item"] },
      ],
      relationships: [],
      callouts: [],
      footer: "Bad",
      provenance: [],
    }, ["Diagram card overflow: Too much."]);
    expect(bad.status).toBe("NEEDS_REVIEW");
    expect(bad.warnings.join(" ")).toContain("overflow");
    expect(bad.checks.typography).toBe("NEEDS_REVIEW");
    expect(bad.checks.provenance).toBe("NEEDS_REVIEW");
  });

  it("keeps deterministic diagrams authoritative over optional AI polish", () => {
    expect(source).toContain("assetType?: \"screenshot\" | \"diagram\" | \"ai_polish\"");
    expect(source).toContain("LINKEDIN_ENABLE_AI_VISUAL_POLISH");
    expect(source).toContain("Treat AI polish as optional social texture");
    expect(source).toContain("passingDiagrams");
    expect(source).toContain("architecture-topology-v1");
    expect(source).toContain("topology_legend");
    expect(source).toContain("staff-engineer-html-v1");
  });
});

function badTopologySpec(): ArchitectureTopologySpec {
  const base = buildArchitectureTopologySpec(architectureDirection());
  return {
    ...base,
    groups: [],
    nodes: [
      ...base.nodes,
      { id: "bad", label: "This node label is too long for topology readability", icon: "BAD", x: 1200, y: 900 },
      { id: "bad2", label: "Another long topology node label", icon: "BAD", x: 1210, y: 910 },
      { id: "bad3", label: "Another long topology node label", icon: "BAD", x: 1220, y: 920 },
      { id: "bad4", label: "Another long topology node label", icon: "BAD", x: 1230, y: 930 },
      { id: "bad5", label: "Another long topology node label", icon: "BAD", x: 1240, y: 940 },
    ],
    edges: [...base.edges, { from: "missing", to: "bad", label: "this connector label is intentionally too long", style: "solid" }],
    legend: [{ number: 1, title: "This legend card title is far too long for the side rail", color: "#fff", bullets: ["This legend bullet is intentionally far too long for a compact LinkedIn topology diagram side rail and should be flagged by QA.", "Two", "Three"] }],
    provenance: [],
  };
}

function architectureDirection(): LinkedInContentDirection {
  return {
    prompt: "I would like a post documenting our system architecture with architectural diagrams",
    tone: "bold_grounded",
    format: "decision_diary",
    legacyPillar: "architecture",
    visualDirection: "show system architecture diagrams",
    selectedAngle: "Architecture diagrams for Job Search OS",
    rejectedAngles: [],
    intent: "architecture_diagram",
    obligations: {
      topic: "system architecture with architectural diagrams",
      requiredConcepts: ["architecture", "Next.js", "API routes", "agent services", "Prisma/Postgres", "AgentRun", "memory", "approval gates", "LinkedIn publish", "diagram"],
      requiredVisuals: ["architecture_diagram"],
      forbiddenPhrases: ["practical testbed", "blank page", "boundary matters", "today's content brief", "i would document", "clearest source", "latest run moved through", "drop-off pattern"],
      allowSearchFunnelAnalytics: false,
    },
  };
}
