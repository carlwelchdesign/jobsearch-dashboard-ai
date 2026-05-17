import type { ApplicationOutcomeType, JobMatchStatus, Prisma } from "@prisma/client";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { ensureInterviewPrepForApplication } from "@/lib/applications/interview-prep-workflow";
import { submittedApplicationStatuses } from "@/lib/applications/job-filters";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { refreshOutcomeCalibration, type OutcomeCalibrationRefreshSource } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export type RecordApplicationOutcomeInput = {
  applicationId: string;
  outcome: ApplicationOutcomeType;
  notes?: string | null;
  occurredAt?: Date;
  source?: OutcomeCalibrationRefreshSource;
};

export async function recordApplicationOutcome(input: RecordApplicationOutcomeInput) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      jobPosting: {
        select: {
          id: true,
          company: true,
          title: true,
          location: true,
          duplicateGroupId: true,
        },
      },
    },
  });
  if (!application) throw new Error("Application not found.");

  const occurredAt = input.occurredAt ?? new Date();
  const nextStatus = statusForOutcome(input.outcome);
  const outcome = await prisma.$transaction(async (tx) => {
    const created = await tx.applicationOutcome.create({
      data: {
        userId: application.userId,
        applicationId: application.id,
        jobPostingId: application.jobPostingId,
        outcome: input.outcome,
        notes: input.notes?.trim() || null,
        occurredAt,
      },
    });

    await tx.application.update({
      where: { id: application.id },
      data: {
        status: nextStatus,
        appliedAt: input.outcome === "APPLIED" && !application.appliedAt ? occurredAt : application.appliedAt,
        followUpAt: followUpAtForOutcome({
          outcome: input.outcome,
          occurredAt,
          existingFollowUpAt: application.followUpAt,
        }),
      },
    });

    if (application.jobProfileMatchId) {
      await tx.jobProfileMatch.update({
        where: { id: application.jobProfileMatchId },
        data: {
          status: nextStatus,
          reviewedAt: occurredAt,
        },
      });
    }

    await tx.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: input.outcome === "APPLIED" ? "applied" : "status_changed",
        payload: {
          outcome: input.outcome,
          status: nextStatus,
          notes: input.notes ?? null,
          occurredAt: occurredAt.toISOString(),
          company: application.jobPosting.company,
          title: application.jobPosting.title,
        } as Prisma.InputJsonValue,
      },
    });

    return created;
  });
  if (submittedApplicationStatuses.includes(nextStatus)) {
    await recordSubmittedJobSuppression({
      userId: application.userId,
      job: application.jobPosting,
      jobProfileMatchId: application.jobProfileMatchId,
      applicationId: application.id,
      source: "application_outcome",
      reason: input.outcome,
    });
    await reconcileApplicationCanonicalState({
      applicationId: application.id,
      source: input.source ?? "application_outcome",
    }).catch(() => null);
  }
  await syncApplicationPacket(application.id);
  if (shouldTriggerInterviewPrepForOutcome(input.outcome)) {
    await ensureInterviewPrepForApplication({
      applicationId: application.id,
      userId: application.userId,
      source: "outcome",
    }).catch(() => null);
  }
  refreshOutcomeCalibration({
    userId: application.userId,
    source: input.source ?? "application_outcome",
  });

  return {
    outcome,
    status: nextStatus,
    message: `${labelForOutcome(input.outcome)} recorded for ${application.jobPosting.company} - ${application.jobPosting.title}.`,
  };
}

export function shouldTriggerInterviewPrepForOutcome(outcome: ApplicationOutcomeType) {
  return outcome === "RECRUITER_SCREEN" || outcome === "TECH_SCREEN" || outcome === "ONSITE" || outcome === "FINAL";
}

export function followUpAtForOutcome(input: {
  outcome: ApplicationOutcomeType;
  occurredAt: Date;
  existingFollowUpAt?: Date | null;
}) {
  if (input.outcome === "APPLIED") {
    return input.existingFollowUpAt ?? daysAfter(input.occurredAt, 7);
  }
  if (input.outcome === "GHOSTED") {
    return input.occurredAt;
  }
  if (["RECRUITER_SCREEN", "TECH_SCREEN", "ONSITE", "FINAL", "OFFER", "REJECTED", "CLOSED"].includes(input.outcome)) {
    return null;
  }
  return input.existingFollowUpAt ?? null;
}

export function statusForOutcome(outcome: ApplicationOutcomeType): JobMatchStatus {
  if (outcome === "APPLIED") return "applied";
  if (outcome === "RECRUITER_SCREEN") return "screening";
  if (outcome === "TECH_SCREEN" || outcome === "ONSITE" || outcome === "FINAL") return "interviewing";
  if (outcome === "OFFER") return "offer";
  if (outcome === "REJECTED") return "rejected_by_company";
  if (outcome === "GHOSTED") return "follow_up_due";
  return "archived";
}

function daysAfter(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function labelForOutcome(outcome: ApplicationOutcomeType) {
  return outcome
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
