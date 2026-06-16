import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { assessApplicationUrlQuality } from "@/lib/applications/application-url-quality";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { isJobSuppressed, loadJobSuppressionStatesByUserIds } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  minimumScore: z.number().int().min(0).max(100).default(85),
  limit: z.number().int().min(1).max(50).default(10),
  profileId: z.string().optional(),
  statuses: z.array(z.enum(["approved", "resume_generated", "cover_letter_generated"])).default(["approved"]),
});

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const rawMatches = await prisma.jobProfileMatch.findMany({
      where: {
        status: { in: input.statuses },
        overallScore: { gte: input.minimumScore },
        ...(input.profileId ? { jobSearchProfileId: input.profileId } : {}),
        jobPosting: {
          applicationUrl: { not: null },
        },
      },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, location: true, applicationUrl: true, duplicateGroupId: true, lastSeenAt: true } },
        jobSearchProfile: { select: { id: true, name: true, userId: true } },
      },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: input.limit * 4,
    });
    const suppressionStates = await loadJobSuppressionStatesByUserIds(rawMatches.map((match) => match.jobSearchProfile.userId));
    const matches = uniqueMatchesByCanonicalJob(rawMatches)
      .filter((match) => assessApplicationUrlQuality(match.jobPosting.applicationUrl).launchable)
      .filter((match) => {
        const suppressionState = suppressionStates.get(match.jobSearchProfile.userId);
        if (suppressionState && isJobSuppressed(match.jobPosting, suppressionState)) return false;
        return true;
      })
      .slice(0, input.limit);

    const nextAvailableCandidates =
      matches.length === 0
        ? await prisma.jobProfileMatch.findMany({
            where: {
              status: { in: input.statuses },
              ...(input.profileId ? { jobSearchProfileId: input.profileId } : {}),
              jobPosting: {
                applicationUrl: { not: null },
              },
            },
            include: {
              jobPosting: { select: { company: true, title: true, applicationUrl: true } },
              jobSearchProfile: { select: { name: true } },
            },
            orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
            take: 25,
          })
        : [];
    const directNextAvailable = nextAvailableCandidates.find((candidate) => assessApplicationUrlQuality(candidate.jobPosting.applicationUrl).launchable) ?? null;

    const results = [];
    for (const match of matches) {
      try {
        const prepared = await prepareApplicationPackage(match.jobPostingId);
        results.push({
          ok: true,
          matchId: match.id,
          jobId: match.jobPostingId,
          company: match.jobPosting.company,
          title: match.jobPosting.title,
          score: match.overallScore,
          profile: match.jobSearchProfile.name,
          applicationId: prepared.application.id,
          resumeId: prepared.resume.id,
          coverLetterId: prepared.coverLetter.id,
        });
      } catch (error) {
        results.push({
          ok: false,
          matchId: match.id,
          jobId: match.jobPostingId,
          company: match.jobPosting.company,
          title: match.jobPosting.title,
          score: match.overallScore,
          profile: match.jobSearchProfile.name,
          error: error instanceof Error ? error.message : "Unknown preparation failure",
        });
      }
    }

    return NextResponse.json({
      requested: input,
      eligible: matches.length,
      candidatesFound: rawMatches.length,
      nextAvailable: directNextAvailable
        ? {
            score: directNextAvailable.overallScore,
            status: directNextAvailable.status,
            company: directNextAvailable.jobPosting.company,
            title: directNextAvailable.jobPosting.title,
            profile: directNextAvailable.jobSearchProfile.name,
          }
        : null,
      prepared: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      manualSubmissionRequired: true,
      results,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
