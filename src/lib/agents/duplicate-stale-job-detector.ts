import crypto from "crypto";
import type { JobPosting, Prisma } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { createCanonicalJobKeys } from "@/lib/job-search/dedupe";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type DuplicateStaleJobDetectorInput = {
  jobPostingId?: string;
  limit?: number;
  userId?: string;
};

export type DuplicateStaleJobDetectorOutput = {
  analyzedJobs: number;
  updatedJobs: number;
  duplicateGroups: Array<{
    duplicateGroupId: string;
    canonicalKey: string;
    jobIds: string[];
    primaryJobId: string;
    summary: string;
  }>;
  staleJobs: Array<{
    jobId: string;
    company: string;
    title: string;
    staleScore: number;
    reasons: string[];
  }>;
  confidence: number;
  reasoningSummary: string;
};

export type JobForDetection = Pick<
  JobPosting,
  "id" | "company" | "title" | "location" | "description" | "applicationUrl" | "duplicateGroupId" | "staleScore" | "firstSeenAt" | "lastSeenAt" | "updatedAt" | "rawData"
>;

export async function runDuplicateStaleJobDetectorAgent(input: DuplicateStaleJobDetectorInput = {}) {
  return runAgent<DuplicateStaleJobDetectorInput, DuplicateStaleJobDetectorOutput>({
    agentType: "DUPLICATE_STALE_JOB_DETECTOR",
    input,
    userId: input.userId,
    execute: async () => {
      const jobs = await loadJobsForDetection(input);
      const output = buildDuplicateStaleDetection(jobs);
      await persistDuplicateStaleDetection(output, jobs);
      return output;
    },
  });
}

export function buildDuplicateStaleDetection(jobs: JobForDetection[], now = new Date()): DuplicateStaleJobDetectorOutput {
  const groupsByKey = new Map<string, JobForDetection[]>();
  for (const job of jobs) {
    const key = createCanonicalJobKeys(job).at(-1) ?? createCanonicalJobKeys(job)[0] ?? "";
    if (!key) continue;
    groupsByKey.set(key, [...(groupsByKey.get(key) ?? []), job]);
  }

  const duplicateGroups: DuplicateStaleJobDetectorOutput["duplicateGroups"] = [];
  const staleJobs: DuplicateStaleJobDetectorOutput["staleJobs"] = [];
  let updatedJobs = 0;

  for (const [canonicalKey, groupJobs] of groupsByKey.entries()) {
    const duplicateGroupId = groupJobs.length > 1 ? duplicateGroupIdFor(canonicalKey) : "";
    const primary = choosePrimaryJob(groupJobs);
    if (groupJobs.length > 1 && primary) {
      duplicateGroups.push({
        duplicateGroupId,
        canonicalKey,
        jobIds: groupJobs.map((job) => job.id),
        primaryJobId: primary.id,
        summary: `${groupJobs.length} listings appear to describe ${primary.title} at ${primary.company}.`,
      });
    }

    for (const job of groupJobs) {
      const stale = calculateStaleSignal(job, now);
      const nextDuplicateGroupId = duplicateGroupId || null;
      if ((job.duplicateGroupId ?? null) !== nextDuplicateGroupId || job.staleScore !== stale.score) {
        updatedJobs += 1;
      }
      if (stale.score >= 45) {
        staleJobs.push({
          jobId: job.id,
          company: job.company,
          title: job.title,
          staleScore: stale.score,
          reasons: stale.reasons,
        });
      }
    }
  }

  return {
    analyzedJobs: jobs.length,
    updatedJobs,
    duplicateGroups: duplicateGroups.sort((a, b) => b.jobIds.length - a.jobIds.length),
    staleJobs: staleJobs.sort((a, b) => b.staleScore - a.staleScore).slice(0, 60),
    confidence: jobs.length >= 50 ? 0.86 : jobs.length >= 10 ? 0.74 : 0.58,
    reasoningSummary: "Grouped jobs by normalized company, title, and location, then scored stale risk from last seen date, first seen age, closed-posting language, and source metadata.",
  };
}

async function loadJobsForDetection(input: DuplicateStaleJobDetectorInput) {
  if (input.jobPostingId) {
    const target = await prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } });
    if (!target) throw new Error("Job not found.");
    const companyToken = firstSearchToken(target.company);
    const titleToken = firstSearchToken(target.title);
    return prisma.jobPosting.findMany({
      where: {
        OR: [
          { id: target.id },
          ...(companyToken ? [{ company: { contains: companyToken, mode: "insensitive" as const } }] : []),
          ...(titleToken ? [{ title: { contains: titleToken, mode: "insensitive" as const } }] : []),
        ],
      },
      orderBy: { lastSeenAt: "desc" },
      take: Math.max(input.limit ?? 100, 100),
    });
  }

  return prisma.jobPosting.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: input.limit ?? 1000,
  });
}

async function persistDuplicateStaleDetection(output: DuplicateStaleJobDetectorOutput, jobs: JobForDetection[]) {
  const groupByJobId = new Map<string, string | null>();
  for (const group of output.duplicateGroups) {
    for (const jobId of group.jobIds) {
      groupByJobId.set(jobId, group.duplicateGroupId);
    }
  }

  await prisma.$transaction(
    jobs.map((job) => {
      const stale = calculateStaleSignal(job);
      return prisma.jobPosting.update({
        where: { id: job.id },
        data: {
          duplicateGroupId: groupByJobId.get(job.id) ?? null,
          staleScore: stale.score,
        },
      });
    }),
  );
}

function choosePrimaryJob(jobs: JobForDetection[]) {
  return [...jobs].sort((a, b) => {
    const aScore = primaryJobScore(a);
    const bScore = primaryJobScore(b);
    return bScore - aScore || b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
  })[0] ?? null;
}

function primaryJobScore(job: JobForDetection) {
  let score = 0;
  if (job.applicationUrl) score += 15;
  if (job.description.length > 800) score += 10;
  if (jsonArray(job.rawData).length || Object.keys(objectValue(job.rawData)).length) score += 4;
  score -= calculateStaleSignal(job).score * 0.2;
  return score;
}

export function calculateStaleSignal(job: Pick<JobForDetection, "description" | "firstSeenAt" | "lastSeenAt" | "rawData">, now = new Date()) {
  const reasons: string[] = [];
  let score = 0;
  const lastSeenDays = ageInDays(job.lastSeenAt, now);
  const firstSeenDays = ageInDays(job.firstSeenAt, now);
  const text = `${job.description} ${JSON.stringify(job.rawData ?? {})}`.toLowerCase();

  if (lastSeenDays > 90) {
    score += 55;
    reasons.push(`Last seen ${lastSeenDays} days ago.`);
  } else if (lastSeenDays > 45) {
    score += 35;
    reasons.push(`Last seen ${lastSeenDays} days ago.`);
  } else if (lastSeenDays > 21) {
    score += 18;
    reasons.push(`Last seen ${lastSeenDays} days ago.`);
  }

  if (firstSeenDays > 120) {
    score += 20;
    reasons.push(`First discovered ${firstSeenDays} days ago.`);
  } else if (firstSeenDays > 75) {
    score += 10;
    reasons.push(`First discovered ${firstSeenDays} days ago.`);
  }

  if (/\b(no longer accepting|position has been filled|job is closed|posting has expired|not accepting applications)\b/i.test(text)) {
    score += 45;
    reasons.push("Posting text indicates the role may be closed.");
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

function duplicateGroupIdFor(canonicalKey: string) {
  return `dup_${crypto.createHash("sha256").update(canonicalKey).digest("hex").slice(0, 18)}`;
}

function firstSearchToken(value: string) {
  return value.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] ?? null;
}

function ageInDays(date: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function objectValue(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
