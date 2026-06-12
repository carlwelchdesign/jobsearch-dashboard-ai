import type { JobMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildApplySprintTrustFunnel, reasonLabel } from "@/lib/applications/apply-sprint-funnel";
import { createEmptyJobSuppressionState, jobSuppressionStateFromKeys } from "@/lib/jobs/suppression";

const now = new Date("2026-06-12T12:00:00.000Z");

describe("Apply Sprint trust funnel", () => {
  it("classifies eligible needs-review matches as candidates", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun(),
      latestAgencyRun: null,
      matches: [
        match({
          id: "match-1",
          jobPostingId: "job-1",
          company: "Acme",
          title: "Frontend Engineer",
          applicationUrl: "https://jobs.ashbyhq.com/acme/123/application",
        }),
      ],
      applications: [],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map([["user-1", createEmptyJobSuppressionState()]]),
    });

    expect(funnel.summary.eligibleForAgency).toBe(1);
    expect(funnel.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchId: "match-1", canPrepare: true, reasons: [] }),
    ]));
  });

  it("explains no URL, suppression, existing application, failed packet, and canonical hidden cases", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun({ jobsBelowThreshold: 2, jobsSuppressed: 1, listingPagesSuppressed: 3 }),
      latestAgencyRun: {
        id: "agency-1",
        status: "COMPLETED",
        updatedAt: now,
        outputJson: {
          results: [
            {
              matchId: "failed-match",
              jobId: "failed-job",
              company: "Fail Co",
              title: "React Engineer",
              score: 88,
              status: "failed",
              error: "Missing profile material",
            },
          ],
        },
      },
      matches: [
        match({ id: "missing-url", jobPostingId: "missing-url-job", applicationUrl: null }),
        match({ id: "suppressed", jobPostingId: "suppressed-job", company: "Suppressed Co", title: "Frontend Engineer" }),
        match({ id: "failed-match", jobPostingId: "failed-job", company: "Fail Co", title: "React Engineer" }),
      ],
      applications: [
        application({ id: "existing-app", jobPostingId: "suppressed-job", company: "Suppressed Co", title: "Frontend Engineer", status: "applied" }),
        application({ id: "hidden-ready", jobPostingId: "hidden-job", company: "Hidden Co", title: "UI Engineer", status: "ready_to_apply" }),
      ],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map([
        ["user-1", jobSuppressionStateFromKeys(new Set(["suppressed co|frontend engineer"]))],
      ]),
    });

    expect(funnel.hidden.some((item) => item.reasons.includes("no_application_url"))).toBe(true);
    expect(funnel.hidden.some((item) => item.reasons.includes("duplicate_or_suppressed"))).toBe(true);
    expect(funnel.hidden.some((item) => item.reasons.includes("already_has_application"))).toBe(true);
    expect(funnel.hidden.some((item) => item.reasons.includes("packet_generation_failed"))).toBe(true);
    expect(funnel.hidden.some((item) => item.reasons.includes("hidden_by_canonical_duplicate_reconciliation"))).toBe(true);
    expect(funnel.hidden.some((item) => item.reasons.includes("below_profile_threshold"))).toBe(true);
    expect(funnel.summary.agencyFailedSkipped).toBe(1);
    expect(reasonLabel("profile_max_results_cap")).toBe("per-profile maxResultsPerRun cap");
  });
});

function searchRun(stats: { jobsBelowThreshold?: number; jobsSuppressed?: number; listingPagesSuppressed?: number } = {}) {
  return {
    id: "search-1",
    status: "completed",
    triggeredBy: "manual",
    startedAt: now,
    finishedAt: now,
    jobsFetched: 100,
    jobsAfterDedupe: 40,
    jobsAfterFilters: 20,
    jobsSaved: 10,
    progress: [
      {
        at: now.toISOString(),
        message: "done",
        stats: {
          jobsFetched: 100,
          jobsAfterDedupe: 40,
          jobsAfterFilters: 20,
          jobsSaved: 10,
          jobsBelowThreshold: stats.jobsBelowThreshold ?? 0,
          jobsSuppressed: stats.jobsSuppressed ?? 0,
          listingPagesSuppressed: stats.listingPagesSuppressed ?? 0,
        },
      },
    ],
  };
}

function match(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? "match-1",
    jobPostingId: overrides.jobPostingId ?? "job-1",
    status: (overrides.status ?? "needs_review") as JobMatchStatus,
    overallScore: 82,
    updatedAt: now,
    jobSearchProfile: {
      name: "Frontend",
      userId: "user-1",
    },
    jobPosting: {
      id: overrides.jobPostingId ?? "job-1",
      company: overrides.company ?? "Acme",
      title: overrides.title ?? "Frontend Engineer",
      location: "Remote",
      applicationUrl: overrides.applicationUrl === undefined ? "https://example.org/apply" : overrides.applicationUrl,
      duplicateGroupId: null,
      lastSeenAt: now,
    },
  };
}

function application(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? "app-1",
    status: (overrides.status ?? "ready_to_apply") as JobMatchStatus,
    resumeId: "resume-1",
    coverLetterId: "cover-1",
    jobProfileMatchId: null,
    jobPosting: {
      id: overrides.jobPostingId ?? "job-1",
      company: overrides.company ?? "Acme",
      title: overrides.title ?? "Frontend Engineer",
      location: "Remote",
      applicationUrl: "https://example.org/apply",
      duplicateGroupId: null,
      lastSeenAt: now,
    },
  };
}
