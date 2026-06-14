import { describe, expect, it } from "vitest";
import { buildLinkedInContentFallback, reviewLinkedInPostPrivacy } from "@/lib/agents/linkedin-content";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    expect(output.body).toContain("Today's content brief");
    expect(output.body).toContain("Jolene Email Operations");
    expect(output.body).toContain("fetched 1000");
    expect(output.body).toContain("below threshold 800");
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
    expect(output.body).toContain("Write a decision diary");
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
});
