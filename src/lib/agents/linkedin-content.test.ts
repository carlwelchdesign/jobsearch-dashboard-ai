import { describe, expect, it } from "vitest";
import { buildLinkedInContentFallback, reviewLinkedInPostPrivacy } from "@/lib/agents/linkedin-content";

describe("LinkedIn content agent helpers", () => {
  it("generates a grounded deterministic fallback without posting claims", () => {
    const output = buildLinkedInContentFallback({
      pillar: "app_progress",
      generatedAt: "2026-06-12T12:00:00Z",
      sourceFacts: ["Search analytics explain funnel stages."],
      searchRuns: [{ jobsFetched: 1000, jobsSaved: 25, status: "completed", createdAt: "2026-06-12T12:00:00Z" }],
      agentRuns: [],
      sourceCoverage: { activeSources: 42, querySources: 24, manualSources: 6, priorityOneSources: 8 },
      docsSignals: ["Draft-only LinkedIn content is a manual-review artifact."],
    });

    expect(output.mode).toBe("deterministic");
    expect(output.body).toContain("1000 raw results");
    expect(output.body).toContain("42 active sources");
    expect(output.body).not.toMatch(/\bposted\b/i);
    expect(output.body).not.toMatch(/—/);
  });

  it("passes safe aggregate content and rejects private data", () => {
    expect(reviewLinkedInPostPrivacy({
      hook: "A safer workflow starts with clear boundaries.",
      body: "The app tracks aggregate source coverage and review gates without exposing personal application data.",
      sourceFacts: ["Direct ATS adapters and open-web query coverage are separated."],
      screenshotAssets: [{ label: "Safe progress card", path: "/generated/linkedin-content/safe.svg", mimeType: "image/svg+xml", description: "Aggregate metrics only." }],
    })).toMatchObject({ status: "PASS", warnings: [] });

    expect(reviewLinkedInPostPrivacy({
      hook: "Update",
      body: "I applied at Acme for $180k. Email me at person@example.com.",
      sourceFacts: ["https://linkedin.com/jobs/view/123"],
      screenshotAssets: [],
    })).toMatchObject({
      status: "NEEDS_REVIEW",
      blockedTerms: expect.arrayContaining(["email address", "salary or compensation"]),
    });
  });
});
