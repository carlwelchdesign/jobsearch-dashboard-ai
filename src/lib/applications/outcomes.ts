import type { ApplicationOutcomeType, JobMatchStatus, Prisma } from "@prisma/client";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { prisma } from "@/lib/prisma";

export type RecordApplicationOutcomeInput = {
  applicationId: string;
  outcome: ApplicationOutcomeType;
  notes?: string | null;
  occurredAt?: Date;
};

export async function recordApplicationOutcome(input: RecordApplicationOutcomeInput) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: { jobPosting: { select: { company: true, title: true } } },
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
  await syncApplicationPacket(application.id);

  return {
    outcome,
    status: nextStatus,
    message: `${labelForOutcome(input.outcome)} recorded for ${application.jobPosting.company} - ${application.jobPosting.title}.`,
  };
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

export function labelForOutcome(outcome: ApplicationOutcomeType) {
  return outcome
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
