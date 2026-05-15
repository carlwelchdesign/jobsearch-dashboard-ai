import { NextResponse } from "next/server";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = clampNumber(Number(body.limit ?? 25), 1, 100, 25);
    const force = Boolean(body.force);
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const matches = await prisma.jobProfileMatch.findMany({
      where: { status: { notIn: ["rejected", "archived"] } },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: limit * 3,
    });
    const existing = force || matches.length === 0
      ? new Set<string>()
      : new Set(
          (await prisma.jobEvaluation.findMany({
            where: {
              OR: matches.map((match) => ({
                jobPostingId: match.jobPostingId,
                jobSearchProfileId: match.jobSearchProfileId,
              })),
            },
            select: { jobPostingId: true, jobSearchProfileId: true },
          })).map((evaluation) => `${evaluation.jobPostingId}:${evaluation.jobSearchProfileId}`),
        );
    const targets = matches
      .filter((match) => !existing.has(`${match.jobPostingId}:${match.jobSearchProfileId}`))
      .slice(0, limit);
    const results = [];

    for (const target of targets) {
      const result = await runJobFitScoringAgent({
        jobPostingId: target.jobPostingId,
        jobSearchProfileId: target.jobSearchProfileId,
        userId: user?.id,
      });
      results.push(result.output);
    }

    return NextResponse.json({
      count: results.length,
      message: results.length ? `Evaluated ${results.length} jobs.` : "No jobs needed evaluation.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
