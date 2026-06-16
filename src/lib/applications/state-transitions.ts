import type { Application, ApplicationEvent, JobMatchStatus, JobPosting, Prisma } from "@prisma/client";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { refreshOutcomeCalibration, type OutcomeCalibrationRefreshSource } from "@/lib/observability/outcome-calibration";
import { prisma } from "@/lib/prisma";

export type ApplicationTransitionStatus = Extract<
  JobMatchStatus,
  "approved" | "ready_to_apply" | "applied" | "follow_up_due" | "screening" | "interviewing" | "offer" | "rejected_by_company" | "archived"
>;

export type ApplicationTransitionActor = {
  type: "user" | "system" | "agent" | "cron" | "repair";
  id?: string | null;
};

export type ApplicationTransitionInput = {
  applicationId: string;
  toStatus: ApplicationTransitionStatus;
  source: string;
  actor: ApplicationTransitionActor;
  reason: string;
  idempotencyKey?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  note?: string | null;
  sideEffects?: {
    syncPacket?: boolean;
    reconcile?: boolean;
    suppressSubmitted?: boolean;
    refreshOutcomeCalibration?: boolean;
  };
};

export type ApplicationTransitionSideEffects = {
  idempotent: boolean;
  packetSynced: boolean;
  reconciliationRan: boolean;
  submittedSuppressionRecorded: boolean;
  outcomeCalibrationRefreshed: boolean;
  errors: Array<{ step: string; message: string }>;
};

type ApplicationForTransition = Pick<Application, "id" | "userId" | "jobPostingId" | "jobProfileMatchId" | "status" | "approvedAt" | "appliedAt" | "followUpAt" | "notes" | "resumeId" | "coverLetterId" | "version"> & {
  jobPosting: Pick<JobPosting, "id" | "company" | "title" | "location" | "duplicateGroupId">;
};

const submittedStatuses: JobMatchStatus[] = ["applied", "follow_up_due", "screening", "interviewing", "offer", "rejected_by_company"];

export async function transitionApplicationState(input: ApplicationTransitionInput): Promise<{
  application: Application;
  event: ApplicationEvent;
  sideEffects: ApplicationTransitionSideEffects;
}> {
  if (!input.source.trim()) throw new Error("Application transition source is required.");
  if (!input.reason.trim()) throw new Error("Application transition reason is required.");

  if (input.idempotencyKey) {
    const existingEvent = await prisma.applicationEvent.findFirst({
      where: { applicationId: input.applicationId, idempotencyKey: input.idempotencyKey },
      orderBy: { createdAt: "desc" },
    });
    if (existingEvent) {
      const application = await prisma.application.findUnique({ where: { id: input.applicationId } });
      if (!application) throw new Error("Application not found.");
      return {
        application,
        event: existingEvent,
        sideEffects: emptySideEffects({ idempotent: true }),
      };
    }
  }

  const occurredAt = input.occurredAt ?? new Date();
  const { application, event, beforeSnapshot } = await prisma.$transaction(async (tx) => {
    const before = await tx.application.findUnique({
      where: { id: input.applicationId },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, location: true, duplicateGroupId: true } },
      },
    });
    if (!before) throw new Error("Application not found.");

    const beforeJson = applicationSnapshot(before);
    const updateData = transitionUpdateData(before, input, occurredAt);
    const updated = await tx.application.update({
      where: { id: before.id },
      data: updateData,
    });
    const afterJson = applicationSnapshot({ ...before, ...updated });

    if (before.jobProfileMatchId) {
      await tx.jobProfileMatch.update({
        where: { id: before.jobProfileMatchId },
        data: {
          status: input.toStatus,
          reviewedAt: occurredAt,
        },
      }).catch(() => null);
    }

    const createdEvent = await tx.applicationEvent.create({
      data: {
        applicationId: before.id,
        type: input.toStatus === "applied" ? "applied" : "status_changed",
        source: input.source,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        requestId: input.requestId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        beforeJson: beforeJson as Prisma.InputJsonValue,
        afterJson: afterJson as Prisma.InputJsonValue,
        entityVersion: updated.version,
        payload: {
          source: input.source,
          actor: input.actor,
          reason: input.reason,
          previousStatus: before.status,
          status: input.toStatus,
          occurredAt: occurredAt.toISOString(),
          metadata: input.metadata ?? {},
        } as Prisma.InputJsonValue,
      },
    });

    return { application: updated, event: createdEvent, beforeSnapshot: before };
  });

  const sideEffects = await runTransitionSideEffects(input, application, beforeSnapshot);
  return { application, event, sideEffects };
}

function transitionUpdateData(before: ApplicationForTransition, input: ApplicationTransitionInput, occurredAt: Date): Prisma.ApplicationUpdateInput {
  const note = input.note?.trim();
  return {
    status: input.toStatus,
    approvedAt: approvalTimestamp(before, input.toStatus, occurredAt),
    appliedAt: appliedTimestamp(before, input.toStatus, occurredAt),
    followUpAt: followUpAtForStatus(before, input.toStatus, occurredAt),
    notes: note ? appendNote(before.notes, note) : before.notes,
    version: { increment: 1 },
  };
}

async function runTransitionSideEffects(
  input: ApplicationTransitionInput,
  application: Application,
  before: ApplicationForTransition,
): Promise<ApplicationTransitionSideEffects> {
  const sideEffects = emptySideEffects({ idempotent: false });
  const options = input.sideEffects ?? {};

  if (options.syncPacket !== false) {
    await recordSideEffect(sideEffects, "sync_packet", async () => {
      const { syncApplicationPacket } = await import("@/lib/applications/application-packets");
      await syncApplicationPacket(application.id);
      sideEffects.packetSynced = true;
    });
  }

  if (submittedStatuses.includes(application.status) && options.suppressSubmitted !== false) {
    await recordSideEffect(sideEffects, "submitted_suppression", async () => {
      await recordSubmittedJobSuppression({
        userId: application.userId,
        job: before.jobPosting,
        jobProfileMatchId: application.jobProfileMatchId,
        applicationId: application.id,
        source: input.source,
        reason: application.status,
      });
      sideEffects.submittedSuppressionRecorded = true;
    });
  }

  if (submittedStatuses.includes(application.status) && options.reconcile !== false) {
    await recordSideEffect(sideEffects, "canonical_reconciliation", async () => {
      const { reconcileApplicationCanonicalState } = await import("@/lib/applications/reconciliation");
      await reconcileApplicationCanonicalState({
        applicationId: application.id,
        source: input.source,
        useTransitions: true,
      });
      sideEffects.reconciliationRan = true;
    });
  }

  if (options.refreshOutcomeCalibration !== false) {
    refreshOutcomeCalibration({
      userId: application.userId,
      source: input.source as OutcomeCalibrationRefreshSource,
    });
    sideEffects.outcomeCalibrationRefreshed = true;
  }

  return sideEffects;
}

async function recordSideEffect(sideEffects: ApplicationTransitionSideEffects, step: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    sideEffects.errors.push({
      step,
      message: error instanceof Error ? error.message : "Unknown transition side-effect error",
    });
  }
}

function approvalTimestamp(before: Pick<Application, "approvedAt">, status: ApplicationTransitionStatus, occurredAt: Date) {
  return (status === "approved" || status === "ready_to_apply") && !before.approvedAt ? occurredAt : before.approvedAt;
}

function appliedTimestamp(before: Pick<Application, "appliedAt">, status: ApplicationTransitionStatus, occurredAt: Date) {
  return status === "applied" && !before.appliedAt ? occurredAt : before.appliedAt;
}

function followUpAtForStatus(before: Pick<Application, "followUpAt">, status: ApplicationTransitionStatus, occurredAt: Date) {
  if (status === "applied") return before.followUpAt ?? daysAfter(occurredAt, 7);
  if (status === "follow_up_due") return occurredAt;
  if (["screening", "interviewing", "offer", "rejected_by_company", "archived"].includes(status)) return null;
  return before.followUpAt;
}

function applicationSnapshot(application: Pick<ApplicationForTransition, "id" | "status" | "approvedAt" | "appliedAt" | "followUpAt" | "jobPostingId" | "jobProfileMatchId" | "resumeId" | "coverLetterId" | "version">) {
  return {
    id: application.id,
    status: application.status,
    approvedAt: application.approvedAt?.toISOString() ?? null,
    appliedAt: application.appliedAt?.toISOString() ?? null,
    followUpAt: application.followUpAt?.toISOString() ?? null,
    jobPostingId: application.jobPostingId,
    jobProfileMatchId: application.jobProfileMatchId,
    resumeId: application.resumeId,
    coverLetterId: application.coverLetterId,
    version: application.version,
  };
}

function appendNote(existing: string | null, note: string) {
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}

function daysAfter(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function emptySideEffects(input: { idempotent: boolean }): ApplicationTransitionSideEffects {
  return {
    idempotent: input.idempotent,
    packetSynced: false,
    reconciliationRan: false,
    submittedSuppressionRecorded: false,
    outcomeCalibrationRefreshed: false,
    errors: [],
  };
}
