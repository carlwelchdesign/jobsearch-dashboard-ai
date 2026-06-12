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
