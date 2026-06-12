import type { JobMatchStatus, Prisma } from "@prisma/client";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { clearJobSuppressionForApproval } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

export async function approveJobMatchForApplication(input: {
  jobPostingId: string;
  matchId: string;
  source: "job_approval" | "chrome_capture";
}) {
  const match = await prisma.jobProfileMatch.update({
    where: { id: input.matchId },
    data: { status: "approved", reviewedAt: new Date() },
    include: {
      jobSearchProfile: { select: { userId: true } },
      jobPosting: { select: { id: true, company: true, title: true, location: true, lastSeenAt: true, duplicateGroupId: true } },
    },
  });
  await clearJobSuppressionForApproval(match.jobSearchProfile.userId, match.jobPosting);
  const application = await upsertApprovedApplication({
    userId: match.jobSearchProfile.userId,
    jobPostingId: input.jobPostingId,
    jobProfileMatchId: match.id,
    jobPosting: match.jobPosting,
    source: input.source,
  });
  if (application) {
    await reconcileApplicationCanonicalState({
      applicationId: application.id,
      source: input.source,
    }).catch(() => null);
  }

  return { match, application };
}

export async function approveBestCapturedJobMatch(input: {
  jobPostingId: string;
}) {
  const match = await prisma.jobProfileMatch.findFirst({
    where: { jobPostingId: input.jobPostingId },
    orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
    select: { id: true },
  });
  if (!match) return null;

  return approveJobMatchForApplication({
    jobPostingId: input.jobPostingId,
    matchId: match.id,
    source: "chrome_capture",
  });
}

async function upsertApprovedApplication(input: {
  userId: string;
  jobPostingId: string;
  jobProfileMatchId: string;
  jobPosting: {
    company: string;
    title: string;
    location: string | null;
    lastSeenAt: Date;
  };
  source: "job_approval" | "chrome_capture";
}) {
  const existingApplications = await prisma.application.findMany({
    where: { userId: input.userId },
    include: {
      jobPosting: {
        select: {
          company: true,
          title: true,
          location: true,
          lastSeenAt: true,
        },
      },
    },
  });
  const existing = existingApplications.find((application) => application.jobPostingId === input.jobPostingId)
    ?? (hasApplicationForJob(input.jobPosting, applicationJobKeySet(existingApplications))
      ? existingApplications.find((application) => hasApplicationForJob(input.jobPosting, applicationJobKeySet([application])))
      : null);

  const application = existing
    ? await prisma.application.update({
        where: { id: existing.id },
        data: {
          jobProfileMatchId: input.jobProfileMatchId,
          status: nextApprovedApplicationStatus(existing.status),
          approvedAt: existing.approvedAt ?? new Date(),
          notes: mergeApprovalNote(existing.notes, input.source),
        },
      })
    : await prisma.application.create({
        data: {
          userId: input.userId,
          jobPostingId: input.jobPostingId,
          jobProfileMatchId: input.jobProfileMatchId,
          status: "approved",
          approvedAt: new Date(),
          notes: approvalNote(input.source),
        },
      });

  if (!existing) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: "status_changed",
        payload: {
          source: input.source,
          status: "approved",
          jobProfileMatchId: input.jobProfileMatchId,
          note: eventNote(input.source),
        } as Prisma.InputJsonValue,
      },
    });
  }

  return application;
}

function nextApprovedApplicationStatus(status: JobMatchStatus | string) {
  if (["ready_to_apply", "resume_generated", "cover_letter_generated", "applied", "follow_up_due", "screening", "interviewing", "rejected_by_company", "offer", "archived"].includes(status)) {
    return status as JobMatchStatus;
  }
  return "approved";
}

function approvalNote(source: "job_approval" | "chrome_capture") {
  return source === "chrome_capture"
    ? "Chrome-captured job approved automatically. Application tracker created for Apply Sprint."
    : "Job approved. Application tracker created automatically.";
}

function eventNote(source: "job_approval" | "chrome_capture") {
  return source === "chrome_capture"
    ? "Application tracker created automatically after Chrome capture approval."
    : "Application tracker created automatically after job approval.";
}

function mergeApprovalNote(existing: string | null, source: "job_approval" | "chrome_capture") {
  const note = approvalNote(source);
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}
