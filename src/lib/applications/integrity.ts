import type { Application, ApplicationAutomationRun, EmailMessageRecord, JobMatchStatus, JobPosting, JobProfileMatch } from "@prisma/client";
import { recordApplicationOutcome } from "@/lib/applications/outcomes";
import {
  canonicalApplicationGroupKey,
  createApplicationCanonicalJobKeys,
  duplicateApplicationCleanupIds,
  reconcileApplicationCanonicalState,
  submittedStatus,
  visibleCanonicalApplications,
} from "@/lib/applications/reconciliation";
import { transitionApplicationState, type ApplicationTransitionStatus } from "@/lib/applications/state-transitions";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

type IntegrityJob = Pick<JobPosting, "id" | "company" | "title" | "location" | "lastSeenAt" | "duplicateGroupId">;
type IntegrityMatch = Pick<JobProfileMatch, "id" | "status" | "jobPostingId"> & {
  jobPosting: IntegrityJob;
  jobSearchProfile: { userId: string };
};
type IntegrityApplication = Pick<Application, "id" | "userId" | "jobPostingId" | "jobProfileMatchId" | "status" | "appliedAt" | "updatedAt" | "createdAt" | "notes"> & {
  jobPosting: IntegrityJob;
  jobProfileMatch?: Pick<JobProfileMatch, "id" | "status"> | null;
  emailMessages?: Array<Pick<EmailMessageRecord, "id" | "classification" | "confidenceScore">>;
  automationRuns?: Array<Pick<ApplicationAutomationRun, "id" | "status" | "blockerType">>;
};

export type ApplicationIntegrityIssueKind =
  | "STALE_DUPLICATE_APPLICATION"
  | "MATCH_STATUS_DRIFT"
  | "EMAIL_CONFIRMED_PENDING_APPLICATION"
  | "RESURFACED_SUBMITTED_JOB"
  | "ASSISTANT_SUBMITTED_STATUS_DRIFT";

export type ApplicationIntegrityIssue = {
  kind: ApplicationIntegrityIssueKind;
  severity: "watch" | "needs_repair";
  applicationId?: string;
  duplicateApplicationId?: string;
  jobPostingId: string;
  jobProfileMatchId?: string | null;
  expectedStatus?: JobMatchStatus;
  actualStatus?: JobMatchStatus;
  title: string;
  detail: string;
};

export type ApplicationIntegrityReport = {
  generatedAt: string;
  totalIssues: number;
  issueCounts: Record<ApplicationIntegrityIssueKind, number>;
  visibleApplications: number;
  issues: ApplicationIntegrityIssue[];
};

export type ApplicationIntegrityRepairResult = {
  before: ApplicationIntegrityReport;
  after: ApplicationIntegrityReport;
  repaired: number;
  reconciliation: {
    archivedDuplicates: number;
    syncedMatches: number;
  };
  transitions: {
    count: number;
    eventIds: string[];
  };
};

const activeMatchStatuses: JobMatchStatus[] = ["discovered", "needs_review", "approved", "saved_for_later", "resume_generated", "cover_letter_generated", "ready_to_apply"];
const repairablePendingStatuses: JobMatchStatus[] = ["approved", "ready_to_apply", "resume_generated", "cover_letter_generated"];

export async function auditApplicationIntegrity(input: { userId?: string | null } = {}): Promise<ApplicationIntegrityReport> {
  const [applications, activeMatches] = await Promise.all([
    prisma.application.findMany({
      where: { userId: input.userId ?? undefined },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, location: true, lastSeenAt: true, duplicateGroupId: true } },
        jobProfileMatch: { select: { id: true, status: true } },
        emailMessages: {
          where: { classification: "AUTOMATED_CONFIRMATION", confidenceScore: { gte: 80 } },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
        automationRuns: {
          where: { status: "SUBMITTED" },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: { in: activeMatchStatuses },
        ...(input.userId ? { jobSearchProfile: { userId: input.userId } } : {}),
      },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, location: true, lastSeenAt: true, duplicateGroupId: true } },
        jobSearchProfile: { select: { userId: true } },
      },
      take: 1000,
    }),
  ]);

  return buildApplicationIntegrityReport({ applications, activeMatches });
}

export function buildApplicationIntegrityReport(input: {
  applications: IntegrityApplication[];
  activeMatches?: IntegrityMatch[];
}): ApplicationIntegrityReport {
  const issues: ApplicationIntegrityIssue[] = [];
  const groups = new Map<string, IntegrityApplication[]>();
  const submittedByKey = new Map<string, IntegrityApplication>();

  for (const application of input.applications) {
    const key = canonicalApplicationGroupKey(application);
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }

  for (const group of groups.values()) {
    const visible = visibleCanonicalApplications(group)[0];
    if (visible && submittedStatus(visible.status)) {
      for (const key of createApplicationCanonicalJobKeys(visible.jobPosting)) submittedByKey.set(key, visible);
    }

    for (const duplicateId of duplicateApplicationCleanupIds(group)) {
      const duplicate = group.find((application) => application.id === duplicateId);
      if (!duplicate || !visible) continue;
      issues.push({
        kind: "STALE_DUPLICATE_APPLICATION",
        severity: "needs_repair",
        applicationId: visible.id,
        duplicateApplicationId: duplicate.id,
        jobPostingId: duplicate.jobPostingId,
        jobProfileMatchId: duplicate.jobProfileMatchId,
        expectedStatus: visible.status,
        actualStatus: duplicate.status,
        title: `${duplicate.jobPosting.company} duplicate tracker`,
        detail: `${duplicate.jobPosting.title} is still ${duplicate.status} even though a canonical tracker is ${visible.status}.`,
      });
    }
  }

  for (const application of input.applications) {
    if (application.jobProfileMatch && submittedStatus(application.status) && application.jobProfileMatch.status !== application.status) {
      issues.push({
        kind: "MATCH_STATUS_DRIFT",
        severity: "needs_repair",
        applicationId: application.id,
        jobPostingId: application.jobPostingId,
        jobProfileMatchId: application.jobProfileMatch.id,
        expectedStatus: application.status,
        actualStatus: application.jobProfileMatch.status,
        title: `${application.jobPosting.company} match status drift`,
        detail: `Application is ${application.status}, but the linked match is ${application.jobProfileMatch.status}.`,
      });
    }

    if (repairablePendingStatuses.includes(application.status) && application.emailMessages?.length) {
      issues.push({
        kind: "EMAIL_CONFIRMED_PENDING_APPLICATION",
        severity: "needs_repair",
        applicationId: application.id,
        jobPostingId: application.jobPostingId,
        jobProfileMatchId: application.jobProfileMatchId,
        expectedStatus: "applied",
        actualStatus: application.status,
        title: `${application.jobPosting.company} email confirmation drift`,
        detail: `A received-application email exists, but the tracker is still ${application.status}.`,
      });
    }

    if (!submittedStatus(application.status) && application.automationRuns?.some((run) => run.status === "SUBMITTED")) {
      issues.push({
        kind: "ASSISTANT_SUBMITTED_STATUS_DRIFT",
        severity: "needs_repair",
        applicationId: application.id,
        jobPostingId: application.jobPostingId,
        jobProfileMatchId: application.jobProfileMatchId,
        expectedStatus: "applied",
        actualStatus: application.status,
        title: `${application.jobPosting.company} assistant submit drift`,
        detail: `The assistant recorded a submitted run, but the tracker is still ${application.status}.`,
      });
    }
  }

  for (const match of input.activeMatches ?? []) {
    const submittedApplication = createApplicationCanonicalJobKeys(match.jobPosting)
      .map((key) => submittedByKey.get(key))
      .find(Boolean);
    if (!submittedApplication || match.status === submittedApplication.status) continue;
    issues.push({
      kind: "RESURFACED_SUBMITTED_JOB",
      severity: "needs_repair",
      applicationId: submittedApplication.id,
      jobPostingId: match.jobPostingId,
      jobProfileMatchId: match.id,
      expectedStatus: submittedApplication.status,
      actualStatus: match.status,
      title: `${match.jobPosting.company} resurfaced submitted job`,
      detail: `${match.jobPosting.title} is visible as ${match.status} even though it was already ${submittedApplication.status}.`,
    });
  }

  const issueCounts = emptyIssueCounts();
  for (const issue of issues) issueCounts[issue.kind] += 1;

  return {
    generatedAt: new Date().toISOString(),
    totalIssues: issues.length,
    issueCounts,
    visibleApplications: visibleCanonicalApplications(input.applications).length,
    issues,
  };
}

export async function repairApplicationIntegrity(input: { userId?: string | null; source?: string } = {}): Promise<ApplicationIntegrityRepairResult> {
  const source = input.source ?? "application_integrity_repair";
  const before = await auditApplicationIntegrity({ userId: input.userId });
  const reconciliation = await reconcileApplicationCanonicalState({
    userId: input.userId,
    source,
  });
  let repaired = reconciliation.archivedDuplicates + reconciliation.syncedMatches;
  const transitionEventIds: string[] = [];

  for (const issue of before.issues) {
    if ((issue.kind === "EMAIL_CONFIRMED_PENDING_APPLICATION" || issue.kind === "ASSISTANT_SUBMITTED_STATUS_DRIFT") && issue.applicationId) {
      const existing = await prisma.applicationOutcome.findFirst({
        where: { applicationId: issue.applicationId, outcome: "APPLIED" },
        select: { id: true },
      });
      if (!existing) {
        const result = await recordApplicationOutcome({
          applicationId: issue.applicationId,
          outcome: "APPLIED",
          notes: `Application state integrity repaired ${issue.kind}: ${issue.detail}`,
          source: "application_outcome",
        });
        transitionEventIds.push(result.transition.event.id);
        repaired += 1;
      }
      continue;
    }

    if ((issue.kind === "MATCH_STATUS_DRIFT" || issue.kind === "RESURFACED_SUBMITTED_JOB") && issue.jobProfileMatchId && issue.expectedStatus) {
      if (issue.applicationId && isApplicationTransitionStatus(issue.expectedStatus)) {
        const transition = await transitionApplicationState({
          applicationId: issue.applicationId,
          toStatus: issue.expectedStatus,
          source,
          actor: { type: "repair" },
          reason: issue.detail,
          metadata: repairEventPayload(issue, source),
          sideEffects: {
            syncPacket: false,
            reconcile: false,
            suppressSubmitted: issue.kind === "RESURFACED_SUBMITTED_JOB",
            refreshOutcomeCalibration: true,
          },
        });
        transitionEventIds.push(transition.event.id);
        repaired += 1;
      } else {
        const result = await prisma.jobProfileMatch.updateMany({
          where: { id: issue.jobProfileMatchId, status: { not: issue.expectedStatus } },
          data: { status: issue.expectedStatus, reviewedAt: new Date() },
        });
        repaired += result.count;
      }
    }

    if (issue.kind === "RESURFACED_SUBMITTED_JOB" && issue.applicationId && issue.expectedStatus) {
      const application = await prisma.application.findUnique({
        where: { id: issue.applicationId },
        include: { jobPosting: { select: { id: true, company: true, title: true, location: true, duplicateGroupId: true } } },
      });
      if (application) {
        await recordSubmittedJobSuppression({
          userId: application.userId,
          job: application.jobPosting,
          jobProfileMatchId: issue.jobProfileMatchId,
          applicationId: application.id,
          source,
          reason: issue.expectedStatus,
        }).catch(() => null);
      }
    }
  }

  const after = await auditApplicationIntegrity({ userId: input.userId });
  return {
    before,
    after,
    repaired,
    reconciliation: {
      archivedDuplicates: reconciliation.archivedDuplicates,
      syncedMatches: reconciliation.syncedMatches,
    },
    transitions: {
      count: transitionEventIds.length,
      eventIds: transitionEventIds,
    },
  };
}

function emptyIssueCounts(): Record<ApplicationIntegrityIssueKind, number> {
  return {
    STALE_DUPLICATE_APPLICATION: 0,
    MATCH_STATUS_DRIFT: 0,
    EMAIL_CONFIRMED_PENDING_APPLICATION: 0,
    RESURFACED_SUBMITTED_JOB: 0,
    ASSISTANT_SUBMITTED_STATUS_DRIFT: 0,
  };
}

function repairEventPayload(issue: ApplicationIntegrityIssue, source: string): Record<string, unknown> {
  return {
    source,
    issueKind: issue.kind,
    jobProfileMatchId: issue.jobProfileMatchId ?? null,
    expectedStatus: issue.expectedStatus ?? null,
    actualStatus: issue.actualStatus ?? null,
    detail: issue.detail,
  };
}

function isApplicationTransitionStatus(status: JobMatchStatus): status is ApplicationTransitionStatus {
  return ["approved", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company", "archived"].includes(status);
}
