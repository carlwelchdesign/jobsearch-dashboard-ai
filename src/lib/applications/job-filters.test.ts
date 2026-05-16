import { JobMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applicationJobKeySet, hasApplicationForJob, isSubmittedApplicationStatus, submittedApplicationJobKeySet } from "@/lib/applications/job-filters";

describe("application job filters", () => {
  it("matches tracked applications across duplicate job title and location variants", () => {
    const tracked = applicationJobKeySet([
      {
        status: JobMatchStatus.applied,
        jobPosting: {
          company: "Amplitude, Inc.",
          title: "Sr. Front-End Software Engineer",
          location: "Remote - United States",
        },
      },
    ]);

    expect(hasApplicationForJob({
      company: "Amplitude",
      title: "Senior Frontend Engineer",
      location: "Remote",
    }, tracked)).toBe(true);
  });

  it("only treats submitted or outcome states as submitted applications", () => {
    const submitted = submittedApplicationJobKeySet([
      {
        status: JobMatchStatus.approved,
        jobPosting: { company: "Acme", title: "Frontend Engineer", location: "Remote" },
      },
      {
        status: JobMatchStatus.screening,
        jobPosting: { company: "Beta", title: "Frontend Engineer", location: "Remote" },
      },
    ]);

    expect(hasApplicationForJob({ company: "Acme", title: "Frontend Engineer", location: "Remote" }, submitted)).toBe(false);
    expect(hasApplicationForJob({ company: "Beta", title: "Frontend Engineer", location: "Remote" }, submitted)).toBe(true);
    expect(isSubmittedApplicationStatus(JobMatchStatus.applied)).toBe(true);
    expect(isSubmittedApplicationStatus(JobMatchStatus.ready_to_apply)).toBe(false);
  });
});
