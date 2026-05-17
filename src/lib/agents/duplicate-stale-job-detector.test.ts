import { describe, expect, it } from "vitest";
import { buildDuplicateStaleDetection, calculateStaleSignal, type JobForDetection } from "@/lib/agents/duplicate-stale-job-detector";

function job(overrides: Partial<JobForDetection>): JobForDetection {
  const now = new Date("2026-05-15T12:00:00.000Z");
  return {
    id: "job",
    company: "Example Inc.",
    title: "Senior Frontend Engineer",
    location: "Remote",
    description: "Build React and TypeScript product workflows.",
    applicationUrl: "https://example.com/jobs/1",
    duplicateGroupId: null,
    staleScore: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    updatedAt: now,
    rawData: {},
    ...overrides,
  };
}

describe("duplicate stale job detector", () => {
  it("groups canonical duplicates and chooses a primary listing", () => {
    const now = new Date("2026-05-15T12:00:00.000Z");
    const output = buildDuplicateStaleDetection([
      job({ id: "a", applicationUrl: "https://jobs.example.com/a" }),
      job({ id: "b", title: "Sr Frontend Engineer", applicationUrl: null }),
      job({ id: "c", company: "Other Co", title: "Backend Engineer" }),
    ], now);

    expect(output.duplicateGroups).toHaveLength(1);
    expect(output.duplicateGroups[0]?.jobIds).toEqual(["a", "b"]);
    expect(output.duplicateGroups[0]?.primaryJobId).toBe("a");
    expect(output.updatedJobs).toBe(2);
  });

  it("groups duplicates with title and location variants", () => {
    const now = new Date("2026-05-15T12:00:00.000Z");
    const output = buildDuplicateStaleDetection([
      job({ id: "a", title: "Sr. Front-End Software Engineer", location: "Remote - United States", applicationUrl: "https://jobs.example.com/a" }),
      job({ id: "b", title: "Senior Frontend Engineer", location: "Remote", applicationUrl: "https://jobs.example.com/b" }),
      job({ id: "c", title: "Senior Backend Engineer", location: "Remote", applicationUrl: "https://jobs.example.com/c" }),
    ], now);

    expect(output.duplicateGroups).toHaveLength(1);
    expect(output.duplicateGroups[0]?.jobIds).toEqual(["a", "b"]);
  });

  it("scores stale jobs from last seen age and closed-posting language", () => {
    const now = new Date("2026-05-15T12:00:00.000Z");
    const stale = calculateStaleSignal(job({
      description: "This job is closed and no longer accepting applications.",
      firstSeenAt: new Date("2026-01-01T12:00:00.000Z"),
      lastSeenAt: new Date("2026-02-01T12:00:00.000Z"),
    }), now);

    expect(stale.score).toBe(100);
    expect(stale.reasons).toEqual(expect.arrayContaining(["Posting text indicates the role may be closed."]));
  });

  it("applies stricter learned stale handling for resurfacing jobs", () => {
    const now = new Date("2026-05-15T12:00:00.000Z");
    const listing = job({
      firstSeenAt: new Date("2026-03-15T12:00:00.000Z"),
      lastSeenAt: new Date("2026-04-25T12:00:00.000Z"),
    });

    const baseline = calculateStaleSignal(listing, now);
    const learned = calculateStaleSignal(listing, now, {
      stricterDedupe: true,
      appliedCategories: ["dedupe_ineffective"],
      appliedAdjustmentIds: ["adjustment_1"],
    });

    expect(baseline.score).toBe(0);
    expect(learned.score).toBeGreaterThan(0);
    expect(learned.reasons).toEqual(expect.arrayContaining([
      "Active learning applies stricter review for listings that have not been seen recently.",
      "Active learning applies stricter review for listings that have resurfaced for more than 45 days.",
    ]));
  });
});
