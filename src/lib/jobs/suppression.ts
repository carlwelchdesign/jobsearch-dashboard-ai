import { JobMatchStatus, JobSuppressionKind, Prisma } from "@prisma/client";
import { createCanonicalJobKeys, createCanonicalJobParts } from "@/lib/job-search/dedupe";
import { prisma } from "@/lib/prisma";
import {
  applicationJobKeySet,
  suppressedJobKeySet,
  suppressedJobMatchStatuses,
} from "@/lib/applications/job-filters";

export type JobSuppressionIdentity = {
  id?: string;
  company: string;
  title: string;
  location: string | null;
  applicationUrl?: string | null;
  duplicateGroupId?: string | null;
};

export type JobSuppressionState = {
  canonicalKeys: Set<string>;
  duplicateGroupIds: Set<string>;
  cooldowns: Array<{
    companyKey: string;
    titleFamilyKey: string;
    expiresAt: Date | null;
  }>;
};

type SuppressionRecordInput = {
  userId: string;
  kind: JobSuppressionKind;
  job: JobSuppressionIdentity;
  source: string;
  reason?: string | null;
  jobProfileMatchId?: string | null;
  applicationId?: string | null;
  expiresAt?: Date | null;
};

const ACTIVE_MATCH_STATUSES: JobMatchStatus[] = [
  JobMatchStatus.discovered,
  JobMatchStatus.needs_review,
  JobMatchStatus.approved,
  JobMatchStatus.saved_for_later,
  JobMatchStatus.resume_generated,
  JobMatchStatus.cover_letter_generated,
  JobMatchStatus.ready_to_apply,
];

export function createEmptyJobSuppressionState(): JobSuppressionState {
  return { canonicalKeys: new Set(), duplicateGroupIds: new Set(), cooldowns: [] };
}

export function jobSuppressionStateFromKeys(keys: Set<string>): JobSuppressionState {
  return { canonicalKeys: keys, duplicateGroupIds: new Set(), cooldowns: [] };
}

export function isJobSuppressed(job: JobSuppressionIdentity, state: JobSuppressionState) {
  if (job.duplicateGroupId && state.duplicateGroupIds.has(job.duplicateGroupId)) return true;
  if (createCanonicalJobKeys(job).some((key) => state.canonicalKeys.has(key))) return true;
  const parts = createCanonicalJobParts(job);
  const now = Date.now();
  return state.cooldowns.some((cooldown) => (
    cooldown.companyKey === parts.companyKey
    && (cooldown.titleFamilyKey === "*" || cooldown.titleFamilyKey === parts.titleFamilyKey)
    && (!cooldown.expiresAt || cooldown.expiresAt.getTime() > now)
  ));
}

export async function loadJobSuppressionState(userId: string): Promise<JobSuppressionState> {
  const states = await loadJobSuppressionStatesByUserIds([userId]);
  return states.get(userId) ?? createEmptyJobSuppressionState();
}

export async function loadJobSuppressionStatesByUserIds(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (!uniqueUserIds.length) return new Map<string, JobSuppressionState>();

  const entries = await Promise.all(uniqueUserIds.map(async (userId) => {
    const now = new Date();
    const [suppressions, applications, rejectedMatches] = await Promise.all([
      prisma.jobSuppression?.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          kind: true,
          canonicalKey: true,
          companyKey: true,
          titleFamilyKey: true,
          expiresAt: true,
          duplicateGroupId: true,
        },
      }) ?? Promise.resolve([]),
      prisma.application.findMany({
        where: { userId },
        select: {
          status: true,
          jobPosting: { select: { company: true, title: true, location: true, applicationUrl: true, duplicateGroupId: true, lastSeenAt: true } },
        },
      }),
      prisma.jobProfileMatch.findMany({
        where: {
          status: { in: suppressedJobMatchStatuses },
          jobSearchProfile: { userId },
        },
        select: {
          status: true,
          jobPosting: { select: { company: true, title: true, location: true, applicationUrl: true, duplicateGroupId: true, lastSeenAt: true } },
        },
      }),
    ]);
    const canonicalKeys = new Set<string>();
    const duplicateGroupIds = new Set<string>();
    for (const key of applicationJobKeySet(applications)) canonicalKeys.add(key);
    for (const key of suppressedJobKeySet(rejectedMatches)) canonicalKeys.add(key);
    for (const application of applications) {
      if (application.jobPosting.duplicateGroupId) duplicateGroupIds.add(application.jobPosting.duplicateGroupId);
    }
    for (const match of rejectedMatches) {
      if (match.jobPosting.duplicateGroupId) duplicateGroupIds.add(match.jobPosting.duplicateGroupId);
    }
    for (const suppression of suppressions) {
      if (suppression.kind === JobSuppressionKind.COMPANY_COOLDOWN) continue;
      canonicalKeys.add(suppression.canonicalKey);
      if (suppression.duplicateGroupId) duplicateGroupIds.add(suppression.duplicateGroupId);
    }
    const cooldowns = suppressions
      .filter((suppression) => suppression.kind === JobSuppressionKind.COMPANY_COOLDOWN)
      .map((suppression) => ({
        companyKey: suppression.companyKey,
        titleFamilyKey: suppression.titleFamilyKey,
        expiresAt: suppression.expiresAt,
      }));

    return [userId, { canonicalKeys, duplicateGroupIds, cooldowns }] as const;
  }));

  return new Map(entries);
}

export async function recordRejectedJobSuppression(input: Omit<SuppressionRecordInput, "kind">) {
  await recordJobSuppression({ ...input, kind: JobSuppressionKind.REJECTED_JOB });
  await maybeCreateCompanyCooldown(input.userId, input.job, input.source);
  await rejectActiveSiblingMatches(input.userId, input.job);
}

export async function recordArchivedJobSuppression(input: Omit<SuppressionRecordInput, "kind">) {
  await recordJobSuppression({ ...input, kind: JobSuppressionKind.ARCHIVED_JOB });
  await rejectActiveSiblingMatches(input.userId, input.job, JobMatchStatus.archived);
}

export async function recordSubmittedJobSuppression(input: Omit<SuppressionRecordInput, "kind">) {
  await recordJobSuppression({ ...input, kind: JobSuppressionKind.SUBMITTED_JOB });
}

export async function clearJobSuppressionForApproval(userId: string, job: JobSuppressionIdentity) {
  if (!prisma.jobSuppression) return;
  const parts = createCanonicalJobParts(job);
  await prisma.jobSuppression.deleteMany({
    where: {
      userId,
      OR: [
        {
          kind: { in: [JobSuppressionKind.REJECTED_JOB, JobSuppressionKind.ARCHIVED_JOB] },
          canonicalKey: { in: createCanonicalJobKeys(job) },
        },
        {
          kind: JobSuppressionKind.COMPANY_COOLDOWN,
          companyKey: parts.companyKey,
        },
      ],
    },
  });
}

export async function recordJobSuppression(input: SuppressionRecordInput) {
  if (!prisma.jobSuppression) return;
  const parts = createCanonicalJobParts(input.job);
  const canonicalKeys = createCanonicalJobKeys(input.job);
  await prisma.$transaction(canonicalKeys.map((canonicalKey) => (
    prisma.jobSuppression.upsert({
      where: {
        userId_kind_canonicalKey: {
          userId: input.userId,
          kind: input.kind,
          canonicalKey,
        },
      },
      update: {
        companyKey: parts.companyKey,
        titleFamilyKey: parts.titleFamilyKey,
        locationKey: parts.locationKey,
        reason: input.reason ?? null,
        source: input.source,
        expiresAt: input.expiresAt ?? null,
        jobPostingId: input.job.id ?? null,
        jobProfileMatchId: input.jobProfileMatchId ?? null,
        applicationId: input.applicationId ?? null,
        duplicateGroupId: input.job.duplicateGroupId ?? null,
      },
      create: {
        userId: input.userId,
        kind: input.kind,
        canonicalKey,
        companyKey: parts.companyKey,
        titleFamilyKey: parts.titleFamilyKey,
        locationKey: parts.locationKey,
        reason: input.reason ?? null,
        source: input.source,
        expiresAt: input.expiresAt ?? null,
        jobPostingId: input.job.id ?? null,
        jobProfileMatchId: input.jobProfileMatchId ?? null,
        applicationId: input.applicationId ?? null,
        duplicateGroupId: input.job.duplicateGroupId ?? null,
      },
    })
  )));
}

async function maybeCreateCompanyCooldown(userId: string, job: JobSuppressionIdentity, source: string) {
  const parts = createCanonicalJobParts(job);
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  if (!prisma.jobSuppression) return;
  const [recentFamilyRejectCount, recentCompanyRejectCount] = await Promise.all([
    prisma.jobSuppression.count({
      where: {
        userId,
        kind: JobSuppressionKind.REJECTED_JOB,
        companyKey: parts.companyKey,
        titleFamilyKey: parts.titleFamilyKey,
        createdAt: { gte: since },
      },
    }),
    prisma.jobSuppression.count({
      where: {
        userId,
        kind: JobSuppressionKind.REJECTED_JOB,
        companyKey: parts.companyKey,
        createdAt: { gte: since },
      },
    }),
  ]);
  const writes = [];
  if (recentFamilyRejectCount >= 2) {
    writes.push(upsertCompanyCooldown({
      userId,
      companyKey: parts.companyKey,
      titleFamilyKey: parts.titleFamilyKey,
      source,
      reason: `Auto cooldown after ${recentFamilyRejectCount} recent rejects for this company/title family.`,
    }));
  }
  if (recentCompanyRejectCount >= 3) {
    writes.push(upsertCompanyCooldown({
      userId,
      companyKey: parts.companyKey,
      titleFamilyKey: "*",
      source,
      reason: `Auto cooldown after ${recentCompanyRejectCount} recent rejects for this company.`,
    }));
  }
  await Promise.all(writes);
}

function upsertCompanyCooldown(input: { userId: string; companyKey: string; titleFamilyKey: string; source: string; reason: string }) {
  if (!prisma.jobSuppression) return Promise.resolve(null);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return prisma.jobSuppression.upsert({
    where: {
      userId_kind_canonicalKey: {
        userId: input.userId,
        kind: JobSuppressionKind.COMPANY_COOLDOWN,
        canonicalKey: `${input.companyKey}|${input.titleFamilyKey}`,
      },
    },
    update: {
      companyKey: input.companyKey,
      titleFamilyKey: input.titleFamilyKey,
      locationKey: "*",
      source: input.source,
      reason: input.reason,
      expiresAt,
    },
    create: {
      userId: input.userId,
      kind: JobSuppressionKind.COMPANY_COOLDOWN,
      canonicalKey: `${input.companyKey}|${input.titleFamilyKey}`,
      companyKey: input.companyKey,
      titleFamilyKey: input.titleFamilyKey,
      locationKey: "*",
      source: input.source,
      reason: input.reason,
      expiresAt,
    },
  });
}

async function rejectActiveSiblingMatches(userId: string, job: JobSuppressionIdentity, nextStatus: JobMatchStatus = JobMatchStatus.rejected) {
  if (!prisma.jobProfileMatch?.findMany || !prisma.jobProfileMatch.updateMany) return;
  const candidateMatches = await prisma.jobProfileMatch.findMany({
    where: {
      status: { in: ACTIVE_MATCH_STATUSES },
      jobSearchProfile: { userId },
    },
    select: {
      id: true,
      jobPosting: {
        select: {
          company: true,
          title: true,
          location: true,
          duplicateGroupId: true,
        },
      },
    },
    take: 2000,
  });
  const rejectedKeys = new Set(createCanonicalJobKeys(job));
  const ids = candidateMatches
    .filter((match) => {
      if (job.duplicateGroupId && match.jobPosting.duplicateGroupId === job.duplicateGroupId) return true;
      return createCanonicalJobKeys(match.jobPosting).some((key) => rejectedKeys.has(key));
    })
    .map((match) => match.id);

  if (!ids.length) return;
  await prisma.jobProfileMatch.updateMany({
    where: { id: { in: ids } },
    data: { status: nextStatus, reviewedAt: new Date() },
  });
}

export function suppressionReason(input: { reasons?: string[] | null; note?: string | null }) {
  const reasonText = input.reasons?.length ? input.reasons.join(", ") : "user_rejected";
  return input.note ? `${reasonText}: ${input.note}` : reasonText;
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
