import type { AtsProvider, RemoteType } from "@prisma/client";
import { runDuplicateStaleJobDetectorAgent } from "@/lib/agents/duplicate-stale-job-detector";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { createCanonicalJobKeys, createJobContentHash, hasSameCanonicalJob } from "@/lib/job-search/dedupe";
import { scoreJobForProfile } from "@/lib/job-search/scoring";
import { isJobSuppressed, loadJobSuppressionState } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

export type ManualJobCaptureInput = {
  company?: string | null;
  title?: string | null;
  location?: string | null;
  description?: string | null;
  text?: string | null;
  applicationUrl?: string | null;
  pageUrl?: string | null;
  remoteType?: RemoteType | null;
  atsProvider?: AtsProvider | null;
  sourceName?: string | null;
  rawData?: unknown;
};

export async function captureManualJob(input: ManualJobCaptureInput) {
  const source = await prisma.jobSource.upsert({
    where: { type_name: { type: "manual", name: input.sourceName?.trim() || "Manual Paste" } },
    update: { enabled: true },
    create: { name: input.sourceName?.trim() || "Manual Paste", type: "manual", enabled: true },
  });
  const normalized = {
    company: input.company?.trim() || "Unknown company",
    title: input.title?.trim() || "Untitled role",
    location: input.location?.trim() || null,
    description: input.description?.trim() || input.text?.trim() || "",
    applicationUrl: input.applicationUrl?.trim() || input.pageUrl?.trim() || null,
  };
  const contentHash = createJobContentHash({
    ...normalized,
    applicationUrl: normalized.applicationUrl ?? undefined,
  });
  const existing = await findExistingManualJob(normalized, contentHash);
  const rawData = {
    ...(isRecord(input.rawData) ? input.rawData : {}),
    captureSource: input.sourceName ?? "Manual Paste",
    pageUrl: input.pageUrl ?? null,
  };
  const job = existing
    ? await prisma.jobPosting.update({
        where: { id: existing.id },
        data: {
          ...normalized,
          sourceId: source.id,
          lastSeenAt: new Date(),
          rawData,
        },
      })
    : await prisma.jobPosting.create({
        data: {
          ...normalized,
          sourceId: source.id,
          remoteType: input.remoteType ?? "unknown",
          atsProvider: input.atsProvider ?? "unknown",
          rawData,
          contentHash,
        },
      });
  const profiles = await prisma.jobSearchProfile.findMany({
    where: { enabled: true },
  });
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const matches: unknown[] = [];
  const suppressionState = user ? await loadJobSuppressionState(user.id) : null;
  if (suppressionState && isJobSuppressed({
    company: job.company,
    title: job.title,
    location: job.location,
    applicationUrl: job.applicationUrl,
    duplicateGroupId: job.duplicateGroupId,
  }, suppressionState)) {
    return {
      job,
      matches,
      created: !existing,
      suppressed: true,
    };
  }
  await runDuplicateStaleJobDetectorAgent({ jobPostingId: job.id, userId: user?.id }).catch(() => null);

  for (const profile of profiles) {
    const score = scoreJobForProfile(normalized, profile);

    if (score.overallScore >= profile.minimumMatchScore) {
      const result = await runJobFitScoringAgent({
        jobPostingId: job.id,
        jobSearchProfileId: profile.id,
        userId: user?.id,
      });
      matches.push(result.output);
    }
  }

  return {
    job,
    matches,
    created: !existing,
  };
}

async function findExistingManualJob(normalized: { company: string; title: string; location?: string | null; applicationUrl?: string | null }, contentHash: string) {
  const canonicalKeys = createCanonicalJobKeys(normalized);
  const companyToken = normalized.company.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] ?? null;
  const titleToken = normalized.title.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] ?? null;

  const existing =
    (normalized.applicationUrl ? await prisma.jobPosting.findFirst({ where: { applicationUrl: normalized.applicationUrl } }) : null) ??
    (await prisma.jobPosting.findUnique({ where: { contentHash } }));
  if (existing) return existing;

  const candidates = await prisma.jobPosting.findMany({
    where: {
      OR: [
        ...(companyToken ? [{ company: { contains: companyToken, mode: "insensitive" as const } }] : []),
        ...(titleToken ? [{ title: { contains: titleToken, mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  return candidates.find((candidate) => hasSameCanonicalJob(candidate, normalized)) ??
    candidates.find((candidate) => createCanonicalJobKeys(candidate).some((key) => canonicalKeys.includes(key))) ??
    null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
