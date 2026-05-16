import { JobMatchStatus } from "@prisma/client";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { prisma } from "@/lib/prisma";
import { runSkill } from "@/lib/skills/run-skill";

export type RecruitingAgencyRunInput = {
  minimumScore?: number;
  limit?: number;
  triggeredBy?: "manual" | "cron";
};

export type RecruitingAgencyRunResult = {
  requested: {
    minimumScore: number;
    limit: number;
    triggeredBy: "manual" | "cron";
  };
  approved: number;
  prepared: number;
  failed: number;
  skipped: number;
  results: Array<{
    matchId: string;
    jobId: string;
    applicationId?: string;
    company: string;
    title: string;
    score: number;
    status: "ready_to_apply" | "approved" | "skipped" | "failed";
    error?: string;
  }>;
  message: string;
};

export async function runRecruitingAgency(input: RecruitingAgencyRunInput = {}): Promise<RecruitingAgencyRunResult> {
  const minimumScore = input.minimumScore ?? 90;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const triggeredBy = input.triggeredBy ?? "manual";
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) throw new Error("No user exists. Run seed first.");

  const candidates = await findAgencyCandidates({ userId: user.id, minimumScore, limit });
  const results: RecruitingAgencyRunResult["results"] = [];

  for (const candidate of candidates) {
    try {
      await runSkill({
        skillId: "approve_agency_match",
        input: { userId: user.id, matchId: candidate.id, minimumScore },
        userId: user.id,
      });
      const prepared = await runSkill({
        skillId: "prepare_application_packet",
        input: { jobPostingId: candidate.jobPostingId, userId: user.id },
        userId: user.id,
      });
      const output = prepared.output as { application: { id: string } };
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: output.application.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "ready_to_apply",
      });
    } catch (error) {
      const application = await prisma.application.findFirst({
        where: { userId: user.id, jobPostingId: candidate.jobPostingId },
        select: { id: true },
      });
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: application?.id,
        company: candidate.jobPosting.company,
        title: candidate.jobPosting.title,
        score: candidate.overallScore,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown agency failure",
      });
    }
  }

  const prepared = results.filter((result) => result.status === "ready_to_apply").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    requested: { minimumScore, limit, triggeredBy },
    approved: results.length,
    prepared,
    failed,
    skipped: Math.max(0, limit - results.length),
    results,
    message: `Recruiting agency prepared ${prepared} application package${prepared === 1 ? "" : "s"} from ${results.length} approved match${results.length === 1 ? "" : "es"}. ${failed} failed.`,
  };
}

async function findAgencyCandidates({ userId, minimumScore, limit }: { userId: string; minimumScore: number; limit: number }) {
  const [applications, rawMatches] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      select: {
        status: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    prisma.jobProfileMatch.findMany({
      where: {
        status: JobMatchStatus.needs_review,
        overallScore: { gte: minimumScore },
        jobPosting: {
          applicationUrl: { not: null },
        },
      },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true } },
      },
      orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
      take: limit * 5,
    }),
  ]);
  const applicationKeys = applicationJobKeySet(applications);
  return uniqueMatchesByCanonicalJob(
    rawMatches.filter((match) => !hasApplicationForJob(match.jobPosting, applicationKeys)),
  ).slice(0, limit);
}
