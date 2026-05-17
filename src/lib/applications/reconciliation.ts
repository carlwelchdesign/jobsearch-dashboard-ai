import type { Application, JobMatchStatus, JobPosting, Prisma } from "@prisma/client";
import { createCanonicalJobKeys } from "@/lib/job-search/dedupe";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

type ApplicationWithJob = Pick<Application, "id" | "userId" | "jobPostingId" | "jobProfileMatchId" | "status" | "appliedAt" | "updatedAt" | "createdAt" | "notes"> & {
  jobPosting: Pick<JobPosting, "id" | "company" | "title" | "location" | "lastSeenAt" | "duplicateGroupId">;
};

export type ApplicationReconciliationResult = {
  inspected: number;
  groups: number;
  archivedDuplicates: number;
  syncedMatches: number;
};

const submittedStatuses: JobMatchStatus[] = ["applied", "follow_up_due", "screening", "interviewing", "rejected_by_company", "offer"];
const cleanupStatuses: JobMatchStatus[] = ["approved", "ready_to_apply", "resume_generated", "cover_letter_generated"];

export function canonicalApplicationGroupKey(application: Pick<ApplicationWithJob, "jobPosting">) {
  return createCanonicalJobKeys(application.jobPosting)[0] ?? `${application.jobPosting.company}:${application.jobPosting.title}`.toLowerCase();
}

export function submittedStatus(status: JobMatchStatus | string | null | undefined) {
  return submittedStatuses.includes(status as JobMatchStatus);
}

export function chooseCanonicalApplication<T extends Pick<ApplicationWithJob, "status" | "appliedAt" | "updatedAt" | "createdAt">>(applications: T[]) {
  return [...applications].sort((left, right) => {
    const leftRank = statusRank(left.status);
    const rightRank = statusRank(right.status);
    if (leftRank !== rightRank) return rightRank - leftRank;
    const leftTime = (left.appliedAt ?? left.updatedAt ?? left.createdAt).getTime();
    const rightTime = (right.appliedAt ?? right.updatedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  })[0] ?? null;
}

export function duplicateApplicationCleanupIds<T extends ApplicationWithJob>(applications: T[]) {
  const canonical = chooseCanonicalApplication(applications);
  if (!canonical || !submittedStatus(canonical.status)) return [];
  return applications
    .filter((application) => application.id !== canonical.id && cleanupStatuses.includes(application.status))
    .map((application) => application.id);
}

export async function reconcileApplicationCanonicalState(input: {
  userId?: string | null;
  applicationId?: string | null;
  source: string;
}): Promise<ApplicationReconciliationResult> {
  const scopedApplication = input.applicationId
    ? await prisma.application.findUnique({
        where: { id: input.applicationId },
        select: { userId: true, jobPosting: { select: { company: true, title: true, location: true, lastSeenAt: true, duplicateGroupId: true } } },
      })
    : null;

  const applications = await prisma.application.findMany({
    where: {
      userId: input.userId ?? scopedApplication?.userId ?? undefined,
    },
    include: {
      jobPosting: { select: { id: true, company: true, title: true, location: true, lastSeenAt: true, duplicateGroupId: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });
  const relevantKeys = scopedApplication ? new Set(createCanonicalJobKeys(scopedApplication.jobPosting)) : null;
  const groups = groupApplications(applications.filter((application) => (
    !relevantKeys || createCanonicalJobKeys(application.jobPosting).some((key) => relevantKeys.has(key))
  )));

  let archivedDuplicates = 0;
  let syncedMatches = 0;
  for (const group of groups.values()) {
    const canonical = chooseCanonicalApplication(group);
    if (!canonical || !submittedStatus(canonical.status)) continue;
    const duplicates = group.filter((application) => (
      application.id !== canonical.id && cleanupStatuses.includes(application.status)
    ));
    if (!duplicates.length) {
      syncedMatches += await syncGroupMatches(group, canonical.status);
      continue;
    }

    for (const duplicate of duplicates) {
      await prisma.application.update({
        where: { id: duplicate.id },
        data: {
          status: "archived",
          notes: appendReconciliationNote(duplicate.notes, canonical, input.source),
        },
      });
      await prisma.applicationEvent.create({
        data: {
          applicationId: duplicate.id,
          type: "status_changed",
          payload: {
            source: "application_canonical_reconciliation",
            trigger: input.source,
            status: "archived",
            canonicalApplicationId: canonical.id,
            canonicalStatus: canonical.status,
            note: "Archived duplicate tracker because a canonical submitted application exists.",
          } as Prisma.InputJsonValue,
        },
      });
      archivedDuplicates += 1;
    }
    syncedMatches += await syncGroupMatches(group, canonical.status);
    await recordSubmittedJobSuppression({
      userId: canonical.userId,
      job: canonical.jobPosting,
      jobProfileMatchId: canonical.jobProfileMatchId,
      applicationId: canonical.id,
      source: "application_outcome",
      reason: canonical.status,
    }).catch(() => null);
  }

  return {
    inspected: applications.length,
    groups: groups.size,
    archivedDuplicates,
    syncedMatches,
  };
}

export function visibleCanonicalApplications<T extends ApplicationWithJob>(applications: T[]) {
  return Array.from(groupApplications(applications).values())
    .map((group) => chooseCanonicalApplication(group))
    .filter((application): application is T => Boolean(application));
}

function groupApplications<T extends ApplicationWithJob>(applications: T[]) {
  const groups = new Map<string, T[]>();
  for (const application of applications) {
    const key = canonicalApplicationGroupKey(application);
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }
  return groups;
}

async function syncGroupMatches(group: ApplicationWithJob[], status: JobMatchStatus) {
  const matchIds = Array.from(new Set(group.map((application) => application.jobProfileMatchId).filter((id): id is string => Boolean(id))));
  if (!matchIds.length) return 0;
  const result = await prisma.jobProfileMatch.updateMany({
    where: { id: { in: matchIds }, status: { not: status } },
    data: { status, reviewedAt: new Date() },
  });
  return result.count;
}

function statusRank(status: JobMatchStatus | string) {
  if (status === "offer") return 700;
  if (status === "interviewing") return 650;
  if (status === "screening") return 620;
  if (status === "follow_up_due") return 610;
  if (status === "applied") return 600;
  if (status === "rejected_by_company") return 590;
  if (status === "ready_to_apply") return 400;
  if (status === "cover_letter_generated") return 350;
  if (status === "resume_generated") return 340;
  if (status === "approved") return 300;
  if (status === "archived") return 100;
  return 0;
}

function appendReconciliationNote(existing: string | null, canonical: ApplicationWithJob, source: string) {
  const note = `Archived by application reconciliation because ${canonical.jobPosting.company} - ${canonical.jobPosting.title} is already ${canonical.status}. Source: ${source}.`;
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}
