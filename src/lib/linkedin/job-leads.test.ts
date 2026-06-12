import { describe, expect, it } from "vitest";
import { buildLinkedInOriginalPostingQueries, isLinkedInJobUrl, linkedInLeadHasEnoughDetail, linkedInLeadMetadata } from "@/lib/linkedin/job-leads";

describe("LinkedIn job leads", () => {
  it("recognizes LinkedIn job view URLs only", () => {
    expect(isLinkedInJobUrl("https://www.linkedin.com/jobs/view/123")).toBe(true);
    expect(isLinkedInJobUrl("https://linkedin.com/jobs/view/123?trk=public_jobs")).toBe(true);
    expect(isLinkedInJobUrl("https://www.linkedin.com/in/someone")).toBe(false);
    expect(isLinkedInJobUrl("https://jobs.lever.co/acme/123")).toBe(false);
  });

  it("generates original-posting queries without targeting LinkedIn", () => {
    const queries = buildLinkedInOriginalPostingQueries({
      company: "Acme",
      title: "Senior Frontend Engineer",
      location: "Remote US",
    });

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => query.includes("-site:linkedin.com"))).toBe(true);
    expect(queries.some((query) => query.includes('"Senior Frontend Engineer" "Acme"'))).toBe(true);
    expect(queries.some((query) => /greenhouse|lever|ashby/i.test(query))).toBe(true);
  });

  it("requires company, title, and pasted detail before normal capture scoring", () => {
    expect(linkedInLeadHasEnoughDetail({
      company: "Acme",
      title: "Senior Frontend Engineer",
      selectedText: "React TypeScript product UI role with design systems, accessibility, and platform ownership.",
    })).toBe(true);
    expect(linkedInLeadHasEnoughDetail({
      company: "Acme",
      title: "Senior Frontend Engineer",
      selectedText: "",
    })).toBe(false);
  });

  it("returns lead metadata with review guidance", () => {
    expect(linkedInLeadMetadata({
      pageUrl: "https://www.linkedin.com/jobs/view/123",
      company: "Acme",
      title: "Senior Frontend Engineer",
    })).toMatchObject({
      leadSource: "linkedin",
      linkedInJobUrl: "https://www.linkedin.com/jobs/view/123",
      needsManualText: true,
      captureGuidance: expect.stringContaining("Paste the job title"),
    });
  });
});
