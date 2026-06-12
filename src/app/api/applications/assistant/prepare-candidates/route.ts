import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const prepareCandidatesSchema = z.object({
  matchIds: z.array(z.string().min(1)).min(1).max(25),
});

export async function POST(request: Request) {
  try {
    const { matchIds } = prepareCandidatesSchema.parse(await request.json());
    const matches = await prisma.jobProfileMatch.findMany({
      where: {
        id: { in: matchIds },
        status: "needs_review",
        jobPosting: { applicationUrl: { not: null } },
      },
      select: {
        id: true,
        jobPostingId: true,
        jobPosting: { select: { company: true, title: true } },
      },
    });

    const results: Array<{
      matchId: string;
      jobId: string;
      company: string;
      title: string;
      status: "ready_to_apply" | "failed";
      applicationId?: string;
      error?: string;
    }> = [];

    for (const match of matches) {
      try {
        const prepared = await prepareApplicationPackage(match.jobPostingId);
        results.push({
          matchId: match.id,
          jobId: match.jobPostingId,
          company: match.jobPosting.company,
          title: match.jobPosting.title,
          status: "ready_to_apply",
          applicationId: prepared.application.id,
        });
      } catch (error) {
        results.push({
          matchId: match.id,
          jobId: match.jobPostingId,
          company: match.jobPosting.company,
          title: match.jobPosting.title,
          status: "failed",
          error: error instanceof Error ? error.message : "Packet generation failed.",
        });
      }
    }

    return NextResponse.json({
      requested: matchIds.length,
      found: matches.length,
      prepared: results.filter((result) => result.status === "ready_to_apply").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
