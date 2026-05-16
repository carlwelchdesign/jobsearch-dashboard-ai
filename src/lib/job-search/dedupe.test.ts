import { describe, expect, it } from "vitest";
import { createCanonicalJobKeys, hasSameCanonicalJob } from "@/lib/job-search/dedupe";

describe("job dedupe keys", () => {
  it("matches common title and remote location variants for the same company", () => {
    const first = {
      company: "Acme, Inc.",
      title: "Sr. Front-End Software Engineer",
      location: "Remote - United States",
    };
    const second = {
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote",
    };

    expect(hasSameCanonicalJob(first, second)).toBe(true);
  });

  it("keeps materially different titles separate", () => {
    const senior = {
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote",
    };
    const staff = {
      company: "Acme",
      title: "Staff Frontend Engineer",
      location: "Remote",
    };
    const backend = {
      company: "Acme",
      title: "Senior Backend Engineer",
      location: "Remote",
    };
    const manager = {
      company: "Acme",
      title: "Frontend Engineering Manager",
      location: "Remote",
    };

    expect(hasSameCanonicalJob(senior, staff)).toBe(false);
    expect(hasSameCanonicalJob(senior, backend)).toBe(false);
    expect(hasSameCanonicalJob(senior, manager)).toBe(false);
  });

  it("includes a relaxed family key for display-level grouping", () => {
    expect(createCanonicalJobKeys({
      company: "Example LLC",
      title: "Staff Full-Stack Software Engineer II",
      location: "US Remote",
    })).toContain("example|staff fullstack engineer 2|remote");
  });
});
