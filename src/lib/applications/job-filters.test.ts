import { JobMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applicationJobKeySet, hasApplicationForJob, isSubmittedApplicationStatus, isSuppressedJobStatus, submittedApplicationJobKeySet, suppressedJobKeySet } from "@/lib/applications/job-filters";

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

  it("suppresses rejected jobs and submitted applications by canonical key", () => {
    const suppressed = suppressedJobKeySet([
      {
        status: JobMatchStatus.rejected,
        jobPosting: { company: "Acme Inc.", title: "Sr Software Engineer", location: "Remote - US" },
      },
      {
        status: JobMatchStatus.applied,
        jobPosting: { company: "Beta", title: "Frontend Engineer", location: "Remote" },
      },
      {
        status: JobMatchStatus.approved,
        jobPosting: { company: "Gamma", title: "Frontend Engineer", location: "Remote" },
      },
    ]);

    expect(hasApplicationForJob({ company: "Acme", title: "Senior Engineer", location: "Remote" }, suppressed)).toBe(true);
    expect(hasApplicationForJob({ company: "Beta", title: "Frontend Engineer", location: "Remote" }, suppressed)).toBe(true);
    expect(hasApplicationForJob({ company: "Gamma", title: "Frontend Engineer", location: "Remote" }, suppressed)).toBe(false);
    expect(isSuppressedJobStatus(JobMatchStatus.rejected)).toBe(true);
    expect(isSuppressedJobStatus(JobMatchStatus.approved)).toBe(false);
  });
});
