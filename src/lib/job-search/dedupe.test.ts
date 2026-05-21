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

  it("matches ATS application wrapper company names to the real company and title", () => {
    expect(hasSameCanonicalJob(
      {
        company: "Job Application for Senior Full Stack Engineer, Autopilot at Rocket Money",
        title: "Senior Full Stack Engineer, Autopilot",
        location: "Remote - US",
      },
      {
        company: "Rocket Money",
        title: "Senior Full Stack Engineer, Autopilot",
        location: "United States",
      },
    )).toBe(true);
  });

  it("matches captured title-at-company text to normalized company and title fields", () => {
    expect(hasSameCanonicalJob(
      {
        company: "Staff Full Stack Engineer, Mobile Platform @ Bubble",
        title: "Staff Full Stack Engineer, Mobile Platform",
        location: "Remote",
      },
      {
        company: "Bubble",
        title: "Staff Full Stack Engineer, Mobile Platform",
        location: "Global Remote",
      },
    )).toBe(true);
  });

  it("matches application URL variants without query strings or apply suffixes", () => {
    expect(hasSameCanonicalJob(
      {
        company: "Different shell",
        title: "Different title",
        location: "Remote",
        applicationUrl: "https://jobs.ashbyhq.com/acme/abc-123/application?utm_source=board",
      },
      {
        company: "Acme",
        title: "Senior Frontend Engineer",
        location: "Remote",
        applicationUrl: "https://jobs.ashbyhq.com/acme/abc-123",
      },
    )).toBe(true);
  });
});
