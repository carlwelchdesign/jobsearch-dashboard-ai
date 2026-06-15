import { describe, expect, it } from "vitest";
import { buildSearchRunAnalytics, buildSearchRunTrend } from "@/lib/job-search/run-analytics";

describe("search run analytics", () => {
  it("normalizes older runs that only have persisted counters", () => {
    const analytics = buildSearchRunAnalytics({
      jobsFetched: 100,
      jobsAfterDedupe: 20,
      jobsAfterFilters: 12,
      jobsSaved: 5,
      progress: [],
    });

    expect(analytics.funnel).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Fetched", value: 100, helper: "Raw source results" }),
      expect.objectContaining({ label: "Qualified", value: 12 }),
      expect.objectContaining({ label: "New matches", value: 5 }),
    ]));
    expect(analytics.funnel.some((item) => item.label === "New jobs")).toBe(false);
    expect(analytics.drops).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Below threshold", value: 88 }),
    ]));
    expect(analytics.outcomeMix).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Saved", value: 5 }),
      expect.objectContaining({ label: "Below threshold", value: 88 }),
    ]));
    expect(analytics.topBlocker).toMatchObject({ label: "Below threshold", value: 88 });
    expect(analytics.runQuality).toEqual(expect.objectContaining({ score: expect.any(Number), label: expect.any(String) }));
    expect(analytics.signalProfile.map((item) => item.axis)).toEqual(["Qualified", "Saved", "Agency ready", "Source mix", "Blocker load"]);
    expect(analytics.opportunityTerrain).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Saved", count: 5, fillKey: "Saved" }),
    ]));
    expect(analytics.nextAction).toEqual(expect.objectContaining({ label: "Tune profile thresholds", tone: "warning" }));
  });

  it("builds chart-ready funnel, drop, profile, source, and score datasets from progress diagnostics", () => {
    const analytics = buildSearchRunAnalytics({
      jobsFetched: 200,
      jobsAfterDedupe: 40,
      jobsAfterFilters: 30,
      jobsSaved: 12,
      progress: [
        {
          at: "2026-06-12T12:00:00.000Z",
          message: "done",
          stats: {
            jobsFetched: 200,
            detailCandidates: 160,
            jobsScored: 150,
            jobsAfterDedupe: 40,
            jobsAfterFilters: 30,
            jobsSaved: 12,
            jobsBelowThreshold: 120,
            existingJobDuplicates: 20,
            existingProfileMatches: 3,
            listingPagesSuppressed: 40,
            profileMaxResultsCapped: 2,
            jobsMissingApplicationUrl: 4,
            reviewOnlyMatches: 5,
            agencyEligible: 3,
            scoreBuckets: { below: 80, nearMiss: 40, qualified: 20, highConfidence: 10 },
            byProfile: {
              "Broad LinkedIn Parity": { fetched: 120, scored: 100, qualified: 25, saved: 10, capped: 2 },
            },
            bySource: {
              "Search Query Backlog": { fetched: 150, scored: 130, qualified: 28, saved: 12 },
            },
          },
        },
      ],
    });

    expect(analytics.funnel).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Detail candidates", value: 160 }),
      expect.objectContaining({ label: "Agency eligible", value: 3 }),
    ]));
    expect(analytics.drops).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Review-only broad matches", value: 5 }),
      expect.objectContaining({ label: "Profile cap", value: 2 }),
    ]));
    expect(analytics.scoreDistribution).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Near miss", value: 40 }),
      expect.objectContaining({ label: "High confidence", value: 10 }),
    ]));
    expect(analytics.byProfile[0]).toMatchObject({ label: "Broad LinkedIn Parity", qualified: 25, saved: 10, capped: 2 });
    expect(analytics.bySource[0]).toMatchObject({ label: "Search Query Backlog", qualified: 28, saved: 12 });
    expect(analytics.outcomeMix).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Saved", value: 12 }),
      expect.objectContaining({ label: "Review-only", value: 5 }),
      expect.objectContaining({ label: "Suppressed/listing", value: 40 }),
    ]));
    expect(analytics.sourceYield[0]).toMatchObject({ label: "Search Query Backlog", fetched: 150, qualified: 28, saved: 12, qualifiedRate: 18.7, saveRate: 8 });
    expect(analytics.profileYield[0]).toMatchObject({ label: "Broad LinkedIn Parity", qualified: 25, saved: 10, capped: 2, yieldRate: 40 });
    expect(analytics.qualityBands).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Near miss", value: 40, helper: "Reviewable but not ready" }),
      expect.objectContaining({ label: "High confidence", value: 10 }),
    ]));
    expect(analytics.topBlocker).toMatchObject({ label: "Below threshold", value: 120 });
    expect(analytics.bestSource).toMatchObject({ label: "Search Query Backlog", value: 12 });
    expect(analytics.bestProfile).toMatchObject({ label: "Broad LinkedIn Parity", value: 10 });
    expect(analytics.runQuality.score).toBeGreaterThanOrEqual(0);
    expect(analytics.runQuality.score).toBeLessThanOrEqual(100);
    expect(analytics.signalProfile).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: "Agency ready", value: 25 }),
      expect.objectContaining({ axis: "Blocker load" }),
    ]));
    expect(analytics.opportunityTerrain).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Suppressed/listing", count: 40 }),
      expect.objectContaining({ name: "Review-only", count: 5 }),
    ]));
    expect(analytics.nextAction).toMatchObject({ label: "Move agency-ready matches", tone: "success" });
    expect(analytics.explanations.join(" ")).toContain("held for manual review");
  });

  it("builds chronological trend points", () => {
    expect(buildSearchRunTrend([
      { id: "newer", startedAt: "2026-06-12T12:00:00.000Z", jobsFetched: 20, jobsAfterDedupe: 5, jobsAfterFilters: 4, jobsSaved: 3 },
      { id: "older", startedAt: "2026-06-11T12:00:00.000Z", jobsFetched: 10, jobsAfterDedupe: 3, jobsAfterFilters: 2, jobsSaved: 1 },
    ])).toEqual([
      expect.objectContaining({ id: "older", fetched: 10, qualified: 2, saved: 1 }),
      expect.objectContaining({ id: "newer", fetched: 20, qualified: 4, saved: 3 }),
    ]);
  });
});
