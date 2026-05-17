import { describe, expect, it } from "vitest";
import { buildApplicationIntegrityReport } from "@/lib/applications/integrity";

const now = new Date("2026-05-17T12:00:00.000Z");

describe("application integrity report", () => {
  it("detects stale duplicate trackers when a submitted canonical application exists", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({ id: "app_applied", status: "applied", company: "Gecko Robotics", title: "Software Engineer | 3D Visualization Platform" }),
        application({ id: "app_approved", status: "approved", company: "Gecko Robotics", title: "Software Engineer - 3D Visualization Platform" }),
      ],
    });

    expect(report.issueCounts.STALE_DUPLICATE_APPLICATION).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "STALE_DUPLICATE_APPLICATION",
      applicationId: "app_applied",
      duplicateApplicationId: "app_approved",
      expectedStatus: "applied",
      actualStatus: "approved",
    });
  });

  it("detects cross-region stale duplicate trackers after a same-company title is submitted", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({ id: "linear_applied", status: "applied", company: "Linear", title: "Senior / Staff Fullstack Engineer", location: "North America" }),
        application({ id: "linear_ready_europe", status: "ready_to_apply", company: "Linear", title: "Senior / Staff Fullstack Engineer", location: "Europe" }),
      ],
    });

    expect(report.issueCounts.STALE_DUPLICATE_APPLICATION).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "STALE_DUPLICATE_APPLICATION",
      applicationId: "linear_applied",
      duplicateApplicationId: "linear_ready_europe",
      expectedStatus: "applied",
      actualStatus: "ready_to_apply",
    });
  });

  it("detects submitted application and match status drift", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({
          id: "app_1",
          status: "applied",
          matchId: "match_1",
          matchStatus: "ready_to_apply",
        }),
      ],
    });

    expect(report.issueCounts.MATCH_STATUS_DRIFT).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "MATCH_STATUS_DRIFT",
      jobProfileMatchId: "match_1",
      expectedStatus: "applied",
      actualStatus: "ready_to_apply",
    });
  });

  it("detects email-confirmed pending applications and assistant submitted drift", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({ id: "app_email", status: "ready_to_apply", emailConfirmed: true }),
        application({ id: "app_assistant", status: "ready_to_apply", assistantSubmitted: true }),
      ],
    });

    expect(report.issueCounts.EMAIL_CONFIRMED_PENDING_APPLICATION).toBe(1);
    expect(report.issueCounts.ASSISTANT_SUBMITTED_STATUS_DRIFT).toBe(1);
  });

  it("detects active matches that resurface after a canonical submission", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({ id: "app_1", status: "applied", company: "Acme", title: "Senior Frontend Engineer" }),
      ],
      activeMatches: [
        match({ id: "match_resurfaced", status: "needs_review", company: "Acme", title: "Senior Frontend Engineer" }),
      ],
    });

    expect(report.issueCounts.RESURFACED_SUBMITTED_JOB).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "RESURFACED_SUBMITTED_JOB",
      applicationId: "app_1",
      jobProfileMatchId: "match_resurfaced",
      expectedStatus: "applied",
      actualStatus: "needs_review",
    });
  });

  it("detects active regional variants that resurface after a canonical submission", () => {
    const report = buildApplicationIntegrityReport({
      applications: [
        application({ id: "linear_applied", status: "applied", company: "Linear", title: "Senior / Staff Fullstack Engineer", location: "North America" }),
      ],
      activeMatches: [
        match({ id: "linear_europe_match", status: "ready_to_apply", company: "Linear", title: "Senior / Staff Fullstack Engineer", location: "Europe" }),
      ],
    });

    expect(report.issueCounts.RESURFACED_SUBMITTED_JOB).toBe(1);
    expect(report.issues[0]).toMatchObject({
      kind: "RESURFACED_SUBMITTED_JOB",
      applicationId: "linear_applied",
      jobProfileMatchId: "linear_europe_match",
      expectedStatus: "applied",
      actualStatus: "ready_to_apply",
    });
  });
});

function application(input: {
  id: string;
  status: string;
  company?: string;
  title?: string;
  location?: string;
  matchId?: string | null;
  matchStatus?: string;
  emailConfirmed?: boolean;
  assistantSubmitted?: boolean;
}) {
  const company = input.company ?? "Acme";
  const title = input.title ?? "Senior Frontend Engineer";
  return {
    id: input.id,
    userId: "user_1",
    jobPostingId: `job_${input.id}`,
    jobProfileMatchId: input.matchId ?? null,
    status: input.status,
    appliedAt: input.status === "applied" ? now : null,
    updatedAt: now,
    createdAt: now,
    notes: null,
    jobPosting: {
      id: `job_${input.id}`,
      company,
      title,
      location: input.location ?? "Remote",
      lastSeenAt: now,
      duplicateGroupId: null,
    },
    jobProfileMatch: input.matchId
      ? {
          id: input.matchId,
          status: input.matchStatus ?? input.status,
        }
      : null,
    emailMessages: input.emailConfirmed
      ? [{ id: "email_1", classification: "AUTOMATED_CONFIRMATION", confidenceScore: 90 }]
      : [],
    automationRuns: input.assistantSubmitted
      ? [{ id: "run_1", status: "SUBMITTED", blockerType: null }]
      : [],
  } as never;
}

function match(input: { id: string; status: string; company: string; title: string; location?: string }) {
  return {
    id: input.id,
    status: input.status,
    jobPostingId: `job_${input.id}`,
    jobPosting: {
      id: `job_${input.id}`,
      company: input.company,
      title: input.title,
      location: input.location ?? "Remote",
      lastSeenAt: now,
      duplicateGroupId: null,
    },
    jobSearchProfile: { userId: "user_1" },
  } as never;
}
