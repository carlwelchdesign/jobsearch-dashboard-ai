import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { createCanonicalJobKey, createJobContentHash } from "@/lib/job-search/dedupe";
import { scoreJobForProfile } from "@/lib/job-search/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const source = await prisma.jobSource.upsert({
      where: { type_name: { type: "manual", name: "Manual Paste" } },
      update: { enabled: true },
      create: { name: "Manual Paste", type: "manual", enabled: true },
    });
    const normalized = {
      company: body.company ?? "Unknown company",
      title: body.title ?? "Untitled role",
      location: body.location,
      description: body.description ?? body.text ?? "",
      applicationUrl: body.applicationUrl,
    };
    const contentHash = createJobContentHash(normalized);
    const existing = await findExistingManualJob(normalized, contentHash);
    const job = existing
      ? await prisma.jobPosting.update({
        where: { id: existing.id },
        data: {
          ...normalized,
          sourceId: source.id,
          lastSeenAt: new Date(),
          rawData: body,
        },
      })
      : await prisma.jobPosting.create({
        data: {
          ...normalized,
          sourceId: source.id,
          remoteType: body.remoteType ?? "unknown",
          atsProvider: body.atsProvider ?? "unknown",
          rawData: body,
          contentHash,
        },
      });
    const profiles = await prisma.jobSearchProfile.findMany({
      where: { enabled: true },
    });
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const matches = [];

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

    return NextResponse.json({ job, matches }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function findExistingManualJob(normalized: { company: string; title: string; location?: string; applicationUrl?: string }, contentHash: string) {
  const canonicalKey = createCanonicalJobKey(normalized);
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

  return candidates.find((candidate) => createCanonicalJobKey(candidate) === canonicalKey) ?? null;
}
