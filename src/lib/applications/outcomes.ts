import type { ApplicationOutcomeType } from "@prisma/client";
import { ensureInterviewPrepForApplication } from "@/lib/applications/interview-prep-workflow";
import { transitionApplicationState, type ApplicationTransitionStatus } from "@/lib/applications/state-transitions";
import type { OutcomeCalibrationRefreshSource } from "@/lib/observability/outcome-calibration";
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
  const outcome = await prisma.applicationOutcome.create({
    data: {
      userId: application.userId,
      applicationId: application.id,
      jobPostingId: application.jobPostingId,
      outcome: input.outcome,
      notes: input.notes?.trim() || null,
      occurredAt,
    },
  });

  const transition = await transitionApplicationState({
    applicationId: application.id,
    toStatus: nextStatus,
    source: input.source ?? "application_outcome",
    actor: { type: "user" },
    reason: `${labelForOutcome(input.outcome)} outcome recorded.`,
    occurredAt,
    metadata: {
      outcome: input.outcome,
      outcomeId: outcome.id,
      notes: input.notes ?? null,
      company: application.jobPosting.company,
      title: application.jobPosting.title,
    },
  });

  if (shouldTriggerInterviewPrepForOutcome(input.outcome)) {
    await ensureInterviewPrepForApplication({
      applicationId: application.id,
      userId: application.userId,
      source: "outcome",
    }).catch(() => null);
  }
  return {
    outcome,
    status: nextStatus,
    transition,
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

export function statusForOutcome(outcome: ApplicationOutcomeType): ApplicationTransitionStatus {
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
