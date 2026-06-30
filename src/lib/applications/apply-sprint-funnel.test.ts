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

  it("does not hide ready applications because cover-letter material quality is advisory", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun(),
      latestAgencyRun: null,
      matches: [],
      applications: [
        application({
          id: "weak-letter",
          jobPostingId: "linear-job",
          company: "Linear",
          title: "Product Engineer",
          coverLetterGenerationNotes: {
            materialQuality: {
              status: "BLOCKED",
              launchable: false,
              reason: "Cover letter used deterministic fallback output and must be regenerated or reviewed before launch.",
              reasons: ["deterministic_fallback"],
              score: 44,
              generatedBy: "deterministic_fallback",
              evidenceRefs: [],
            },
          },
        }),
      ],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map(),
    });

    expect(funnel.hidden).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "weak-letter",
        reasons: expect.not.arrayContaining(["material_quality_needs_review"]),
        detail: "hidden by canonical duplicate reconciliation",
        materialQuality: expect.objectContaining({ launchable: false }),
      }),
    ]));
    expect(reasonLabel("material_quality_needs_review")).toBe("material quality needs review");
  });

  it("does not count approved material QA failures as Apply Sprint blockers", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun(),
      latestAgencyRun: null,
      matches: [],
      applications: [
        application({
          id: "approved-quota-blocked",
          jobPostingId: "linear-job",
          company: "Linear",
          title: "Product Engineer",
          status: "approved",
          coverLetterGenerationNotes: {
            generatedBy: "deterministic_fallback",
            generationFailure: {
              provider: "openai",
              code: "openai_insufficient_quota",
              message: "OpenAI quota is exhausted; structured cover-letter generation could not run.",
              retryable: false,
            },
            materialQuality: {
              status: "BLOCKED",
              launchable: false,
              reason: "OpenAI quota is exhausted, so the structured cover-letter writer could not run. Regeneration is required before launch.",
              reasons: ["deterministic_fallback", "openai_insufficient_quota"],
              score: 32,
              generatedBy: "deterministic_fallback",
              evidenceRefs: [],
              generationFailure: {
                provider: "openai",
                code: "openai_insufficient_quota",
                message: "OpenAI quota is exhausted; structured cover-letter generation could not run.",
                retryable: false,
              },
            },
          },
        }),
      ],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map(),
    });

    expect(funnel.summary.visibleReady).toBe(0);
    expect(funnel.summary.materialQualityBlocked).toBe(0);
    expect(funnel.hidden.some((item) => item.id === "approved-quota-blocked")).toBe(false);
  });

  it("keeps review-only broad discovery matches out of agency candidates", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun({ reviewOnlyMatches: 1 }),
      latestAgencyRun: null,
      matches: [
        match({
          id: "broad-review",
          jobPostingId: "broad-job",
          recommendedAction: "Review-only broad discovery: Review and consider approval",
          applicationUrl: "https://jobs.ashbyhq.com/acme/123/application",
        }),
      ],
      applications: [],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map([["user-1", createEmptyJobSuppressionState()]]),
    });

    expect(funnel.summary.eligibleForAgency).toBe(0);
    expect(funnel.hidden).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "broad-review",
        reasons: expect.arrayContaining(["review_only_broad_discovery"]),
      }),
    ]));
    expect(reasonLabel("review_only_broad_discovery")).toBe("review-only broad discovery");
  });

  it("keeps intermediary board URLs out of agency candidates with a specific reason", () => {
    const funnel = buildApplySprintTrustFunnel({
      latestSearchRun: searchRun(),
      latestAgencyRun: null,
      matches: [
        match({
          id: "builtin-match",
          jobPostingId: "builtin-job",
          applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
        }),
      ],
      applications: [
        application({
          id: "builtin-app",
          jobPostingId: "builtin-job",
          applicationUrl: "https://builtin.com/job/frontend-engineer/8269411",
          status: "ready_to_apply",
        }),
      ],
      visibleReadyApplicationIds: new Set(),
      suppressionByUserId: new Map([["user-1", createEmptyJobSuppressionState()]]),
    });

    expect(funnel.summary.eligibleForAgency).toBe(0);
    expect(funnel.hidden).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "builtin-match",
        reasons: expect.arrayContaining(["unsupported_application_url"]),
        detail: expect.stringContaining("job board/intermediary"),
        applicationUrlQuality: expect.objectContaining({
          launchable: false,
          kind: "board_intermediary",
        }),
      }),
    ]));
  });
});

function searchRun(stats: { jobsBelowThreshold?: number; jobsSuppressed?: number; listingPagesSuppressed?: number; reviewOnlyMatches?: number } = {}) {
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
          reviewOnlyMatches: stats.reviewOnlyMatches ?? 0,
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
    recommendedAction: overrides.recommendedAction ?? "Review and consider approval",
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
    coverLetter: {
      generationNotes: overrides.coverLetterGenerationNotes ?? {
        materialQuality: {
          status: "PASS",
          launchable: true,
          reason: "Cover letter passed material quality review.",
          reasons: [],
          score: 92,
          generatedBy: "openai_structured_outputs",
          evidenceRefs: ["ev_1"],
        },
      },
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
