import { JobMatchStatus, Prisma } from "@prisma/client";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { uniqueMatchesByCanonicalJob } from "@/lib/job-search/unique-matches";
import { prisma } from "@/lib/prisma";

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

type AgencyCandidate = Awaited<ReturnType<typeof findAgencyCandidates>>[number];

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
      const application = await approveCandidateForAgency(user.id, candidate);
      const prepared = await prepareApplicationPackage(candidate.jobPostingId);
      results.push({
        matchId: candidate.id,
        jobId: candidate.jobPostingId,
        applicationId: prepared.application.id,
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

async function approveCandidateForAgency(userId: string, candidate: AgencyCandidate) {
  await prisma.jobProfileMatch.update({
    where: { id: candidate.id },
    data: { status: JobMatchStatus.approved, reviewedAt: new Date() },
  });

  const existing = await prisma.application.findFirst({
    where: { userId, jobPostingId: candidate.jobPostingId },
  });

  if (existing) {
    return prisma.application.update({
      where: { id: existing.id },
      data: {
        jobProfileMatchId: candidate.id,
        status: existing.status === JobMatchStatus.applied ? existing.status : JobMatchStatus.approved,
        approvedAt: existing.approvedAt ?? new Date(),
        notes: mergeAgencyNote(existing.notes),
      },
    });
  }

  const application = await prisma.application.create({
    data: {
      userId,
      jobPostingId: candidate.jobPostingId,
      jobProfileMatchId: candidate.id,
      status: JobMatchStatus.approved,
      approvedAt: new Date(),
      notes: "Recruiting agency auto-approved this high-confidence match.",
    },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "status_changed",
      payload: {
        source: "recruiting_agency",
        status: "approved",
        score: candidate.overallScore,
        jobProfileMatchId: candidate.id,
        profile: candidate.jobSearchProfile.name,
      } as Prisma.InputJsonValue,
    },
  });

  return application;
}

function mergeAgencyNote(existing: string | null) {
  const note = "Recruiting agency auto-approved this high-confidence match.";
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}
